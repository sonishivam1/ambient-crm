import "server-only";

import { APICallError, NoObjectGeneratedError, Output, generateText, type LanguageModelUsage } from "ai";
import type { z } from "zod";

import type { AI_ERROR_KINDS, RoleKey } from "@ambient/db";
import { createLogger } from "@ambient/logger";

import { getScope, type Scope } from "@/lib/data/scope";

import { estimateTokens, reserveTokens, settleTokens } from "./budget";
import { addDays } from "@ambient/db/time";

import { cachedOutput, dayOutput, latestOutput, saveOutput, type CacheKey } from "./cache";
import type { AiCardData } from "./cards";
import { modelFor } from "./client";
import { CALL_TIMEOUT_MS, modelIdFor, type AiTier } from "./config";
import { renderFacts, type FactPacket } from "./facts";
import { REFUSAL_MESSAGE, checkAccess, checkLimits, type AiRefusal } from "./gates";
import { logInvocation } from "./log";
import { POLICY_VERSION, policyPrompt, promptContext } from "./prompts/policy";
import { verifySources } from "./verify";

/**
 * The AI engine. Every AI capability in Ambient is a definition run by
 * runAiFeature(), which applies the same safety layer to all of them:
 *
 *   input → scope → access → facts → cache? → limits → budget → model call
 *         → verify → limit → cache → log
 *
 * Nothing else in the app calls a model. See docs/architecture/ai.md.
 */

export type AiFeature<I, O> = {
  /** Also the id a tenant switches on in its AI policy. */
  id: string;
  /** The feature prompt's version; bump it whenever `task` or `output` changes. */
  version: number;
  /** Roles that may use the feature (the tenant's policy narrows this further). */
  roles: readonly RoleKey[];
  tier: AiTier;
  input: z.ZodType<I>;
  /**
   * The reply's shape. OpenAI strict structured outputs need every field
   * present: use `.nullable()`, not `.optional()` or `.default()`.
   */
  output: z.ZodType<O>;
  /**
   * Build this user's facts from scoped read models. The model sees nothing
   * else. Null when the record asked about isn't there for this user.
   */
  facts: (scope: Scope, input: I) => Promise<FactPacket | null>;
  /** The feature prompt: the task, after the shared policy prompt. */
  task: (input: I) => string;
  temperature: number;
  maxOutputTokens: number;
  timeoutMs?: number;
  /** Caps applied to the verified output (counts, lengths, markup) before anyone sees it. */
  limit?: (output: O) => O;
  /** Lines worked out by code from the facts, shown with the answer (never from the model). */
  notes?: (facts: FactPacket) => string[];
  /**
   * Keep the verified answer per user and subject. `facts` (the default): until
   * its facts change, `ttlDays` at most. `day`: until local midnight, with the
   * cards it was shown with, even after the records change.
   */
  cache?: { subject: (input: I) => string } & ({ mode?: "facts"; ttlDays: number } | { mode: "day" });
};

export function defineAiFeature<I, O>(feature: AiFeature<I, O>): AiFeature<I, O> {
  return feature;
}

export type AiFailure = AiRefusal | "invalid_input" | "not_found" | "rejected" | "failed";

export type AiAnswer<O> = {
  output: O;
  /** "repaired" when invented sources were dropped or a retry was needed; "cached" when no model was called. */
  outcome: "ok" | "repaired" | "cached";
  /** Handles the verified output cites, in order. */
  sources: string[];
  /** The cited records as cards, in the same order: what the user sees beside the text. */
  cards: AiCardData[];
  /** The feature's code-computed notes for these facts. */
  notes: string[];
  /** When the answer was generated (earlier than now when cached). */
  generatedAt: Date;
  /** A `day` answer whose records have changed since it was generated. */
  changed: boolean;
};

export type AiResult<O> = ({ ok: true } & AiAnswer<O>) | { ok: false; reason: AiFailure; message: string };

/** What a page can show without calling the model. */
export type AiPeek<O> =
  | { state: "unavailable"; reason: AiFailure; message: string }
  /** Nothing generated yet (or it expired). */
  | { state: "none" }
  /** A summary exists but the records have changed since; it isn't shown. */
  | { state: "stale" }
  | { state: "ready"; answer: AiAnswer<O> };

const TRY_AGAIN = "Couldn't generate this right now. Try again in a moment.";
const NOT_FOUND = "That record isn't available.";
const INVALID = "That request isn't valid.";
export const ROLE_LABEL: Record<RoleKey, string> = {
  user: "Account manager",
  manager: "Manager",
  senior: "Senior manager",
  lead: "Lead",
  admin: "Administrator",
  super: "Super admin",
};
const RETRY_NOTE = "\n\nYour previous reply did not match the required output format. Reply again, following it exactly.";

export type ErrorKind = (typeof AI_ERROR_KINDS)[number];

/** A code for the log. Error messages are never logged: they can echo provider responses. */
export function errorKind(e: unknown): ErrorKind {
  if (NoObjectGeneratedError.isInstance(e)) return "schema";
  if (APICallError.isInstance(e)) return "provider";
  const name = e instanceof Error ? e.name : "";
  if (/abort|timeout/i.test(name)) return "timeout";
  return "unknown";
}

export function addUsage(total: { input: number; output: number }, usage: LanguageModelUsage | undefined) {
  total.input += usage?.inputTokens ?? 0;
  total.output += usage?.outputTokens ?? 0;
}

/** Every handle a verified output cites, in order of first mention. */
export function citedSources(value: unknown, into: string[] = []): string[] {
  if (Array.isArray(value)) value.forEach((v) => citedSources(v, into));
  else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      if (k === "sources" && Array.isArray(v)) {
        for (const h of v) {
          if (typeof h === "string" && !into.includes(h)) into.push(h);
        }
      } else {
        citedSources(v, into);
      }
    }
  }
  return into;
}

/** The answer as the user sees it: cards for what it cites, and the feature's notes. */
function present<I, O>(feature: AiFeature<I, O>, facts: FactPacket, output: O, outcome: AiAnswer<O>["outcome"], generatedAt: Date): AiAnswer<O> {
  const sources = citedSources(output);
  return {
    output,
    outcome,
    sources,
    cards: sources.flatMap((h) => facts.cards.get(h) ?? []),
    notes: feature.notes?.(facts) ?? [],
    generatedAt,
    changed: false,
  };
}

/**
 * A cached answer, or null. `facts` mode: only for these exact facts, checked
 * again against them before it is shown. `day` mode: today's answer as it was
 * shown, with its own cards and notes, flagged when the records have changed.
 */
async function fromCache<I, O>(scope: Scope, feature: AiFeature<I, O>, key: CacheKey, facts: FactPacket): Promise<AiAnswer<O> | null> {
  if (feature.cache?.mode === "day") {
    const row = await dayOutput(scope, key);
    const parsed = row && feature.output.safeParse(row.output);
    if (!row || !parsed?.success) return null;
    return {
      output: parsed.data,
      outcome: "cached",
      sources: citedSources(parsed.data),
      cards: row.cards as AiCardData[],
      notes: row.notes,
      generatedAt: row.createdAt,
      changed: row.factsFingerprint !== key.fingerprint,
    };
  }
  const row = await cachedOutput(scope, key);
  if (!row) return null;
  const parsed = feature.output.safeParse(row.output);
  if (!parsed.success) return null;
  const verified = verifySources(parsed.data, facts.handles);
  if (verified.removed > 0) return null;
  return present(feature, facts, verified.output, "cached", row.createdAt);
}

/** When a new cached answer expires: after `ttlDays`, or at the next local midnight for `day` features. */
function expiryFor<I, O>(scope: Scope, feature: AiFeature<I, O>) {
  const cache = feature.cache!;
  if (cache.mode === "day") return () => addDays(scope.today, 1, scope.timeZone);
  return (createdAt: Date) => new Date(createdAt.getTime() + cache.ttlDays * 86_400_000);
}

function cacheKeyFor<I, O>(feature: AiFeature<I, O>, input: I, facts: FactPacket, model: string): CacheKey | null {
  if (!feature.cache) return null;
  return {
    feature: feature.id,
    subject: feature.cache.subject(input),
    fingerprint: facts.fingerprint,
    promptVersion: feature.version,
    policyVersion: POLICY_VERSION,
    model,
  };
}

const notFoundLog = (scope: Scope, feature: string) =>
  createLogger("ai", { tenantId: scope.tenantId, userId: scope.user._id }).info({ feature, reason: "not_found" }, "AI request for a record that isn't visible");

/** Run one AI feature for the signed-in user. Never throws for expected failures. */
export async function runAiFeature<I, O>(feature: AiFeature<I, O>, rawInput: unknown, options: { refresh?: boolean } = {}): Promise<AiResult<O>> {
  const parsed = feature.input.safeParse(rawInput);
  if (!parsed.success) return { ok: false, reason: "invalid_input", message: INVALID };
  const input = parsed.data;
  const scope = await getScope();

  const base = { feature: feature.id, promptVersion: feature.version, policyVersion: POLICY_VERSION, tier: feature.tier };
  const refuse = async (refusal: AiRefusal): Promise<AiResult<O>> => {
    await logInvocation(scope, { ...base, model: null, inputTokens: 0, outputTokens: 0, latencyMs: 0, attempts: 0, outcome: "refused", refusal, errorKind: null });
    return { ok: false, reason: refusal, message: REFUSAL_MESSAGE[refusal] };
  };

  const denied = await checkAccess(scope, feature);
  if (denied) return refuse(denied);

  const facts = await feature.facts(scope, input);
  // Out of scope, another tenant's or missing: the same answer, and no model call.
  if (!facts) {
    notFoundLog(scope, feature.id);
    return { ok: false, reason: "not_found", message: NOT_FOUND };
  }

  // Access passed, so a model is configured for the tier.
  const cacheKey = cacheKeyFor(feature, input, facts, modelIdFor(feature.tier) ?? "");
  if (cacheKey && !options.refresh) {
    const started = Date.now();
    const hit = await fromCache(scope, feature, cacheKey, facts);
    if (hit) {
      await logInvocation(scope, { ...base, model: cacheKey.model, inputTokens: 0, outputTokens: 0, latencyMs: Date.now() - started, attempts: 0, outcome: "cached", refusal: null, errorKind: null });
      return { ok: true, ...hit };
    }
  }

  const limited = await checkLimits(scope);
  if (limited) return refuse(limited);

  const instructions = `${policyPrompt(
    promptContext({ tenantName: scope.user.tenant.name, userName: scope.user.name, roleLabel: ROLE_LABEL[scope.user.role], timeZone: scope.timeZone }),
  )}\n\n${feature.task(input)}`;
  const prompt = renderFacts(facts);

  const estimate = estimateTokens(instructions.length + prompt.length, feature.maxOutputTokens);
  const month = await reserveTokens(scope, estimate);
  if (!month) return refuse("budget_exhausted");

  const { model, modelId } = modelFor(feature.tier);
  const usage = { input: 0, output: 0 };
  const started = Date.now();
  let attempts = 0;
  let output: O | undefined;
  let failure: ErrorKind | null = null;

  try {
    for (attempts = 1; attempts <= 2; attempts++) {
      try {
        const result = await generateText({
          model,
          instructions,
          prompt: attempts === 1 ? prompt : prompt + RETRY_NOTE,
          output: Output.object({ schema: feature.output, name: feature.id.replace(/-/g, "_") }),
          temperature: feature.temperature,
          maxOutputTokens: feature.maxOutputTokens,
          maxRetries: 1,
          timeout: feature.timeoutMs ?? CALL_TIMEOUT_MS,
          providerOptions: { openai: { strictJsonSchema: true } },
        });
        addUsage(usage, result.totalUsage);
        output = result.output as O;
        failure = null;
        break;
      } catch (e) {
        if (NoObjectGeneratedError.isInstance(e)) addUsage(usage, e.usage);
        failure = errorKind(e);
        // Only a reply in the wrong shape is worth a second try.
        if (failure !== "schema") break;
      }
    }
  } finally {
    await settleTokens(scope, month, estimate, usage.input + usage.output);
  }
  attempts = Math.min(attempts, 2);
  const metrics = { ...base, model: modelId, inputTokens: usage.input, outputTokens: usage.output, latencyMs: Date.now() - started, attempts, refusal: null };

  if (output === undefined) {
    // Codes only: a provider's error message can echo request data.
    createLogger("ai", { tenantId: scope.tenantId, userId: scope.user._id }).warn(
      { feature: feature.id, model: modelId, errorKind: failure ?? "unknown", attempts },
      "AI call failed",
    );
    await logInvocation(scope, { ...metrics, outcome: "failed", errorKind: failure ?? "unknown" });
    return { ok: false, reason: "failed", message: TRY_AGAIN };
  }

  const verified = verifySources(output, facts.handles);
  if (verified.claims > 0 && verified.removed === verified.claims) {
    await logInvocation(scope, { ...metrics, outcome: "rejected", errorKind: null });
    return { ok: false, reason: "rejected", message: TRY_AGAIN };
  }
  const shown = feature.limit ? feature.limit(verified.output) : verified.output;
  const outcome = verified.removed > 0 || attempts > 1 ? "repaired" : "ok";
  const answer = present(feature, facts, shown, outcome, new Date());
  if (cacheKey) {
    answer.generatedAt = await saveOutput(scope, cacheKey, { output: shown, cards: answer.cards, notes: answer.notes, expiresAt: expiryFor(scope, feature) });
  }
  await logInvocation(scope, { ...metrics, outcome, errorKind: null });
  return { ok: true, ...answer };
}

/**
 * What a page shows for a cached feature without calling the model: whether
 * the user can use it, and the cached answer when its facts are unchanged.
 * Writes nothing: no invocation row, no budget, no rate limit.
 */
export async function peekAiFeature<I, O>(feature: AiFeature<I, O>, rawInput: unknown): Promise<AiPeek<O>> {
  const parsed = feature.input.safeParse(rawInput);
  if (!parsed.success) return { state: "unavailable", reason: "invalid_input", message: INVALID };
  const input = parsed.data;
  const scope = await getScope();

  const denied = await checkAccess(scope, feature);
  if (denied) return { state: "unavailable", reason: denied, message: REFUSAL_MESSAGE[denied] };
  if (!feature.cache) return { state: "none" };

  const facts = await feature.facts(scope, input);
  if (!facts) return { state: "unavailable", reason: "not_found", message: NOT_FOUND };

  const key = cacheKeyFor(feature, input, facts, modelIdFor(feature.tier) ?? "")!;
  const hit = await fromCache(scope, feature, key, facts);
  if (hit) return { state: "ready", answer: hit };
  // A `day` answer is never stale: it is served until midnight or not at all.
  if (feature.cache.mode === "day") return { state: "none" };
  return (await latestOutput(scope, feature.id, key.subject)) ? { state: "stale" } : { state: "none" };
}

/**
 * The notes of today's cached answer for a `day` feature, without building
 * facts: a cheap read for a line elsewhere (the dashboard's brief headline).
 * Null when the user can't use the feature or there is no answer today.
 * Writes nothing. (A `facts` feature's answer needs its facts checked first.)
 */
export async function latestNotes<I, O>(feature: AiFeature<I, O>, input: I): Promise<string[] | null> {
  if (feature.cache?.mode !== "day") return null;
  const scope = await getScope();
  if (await checkAccess(scope, feature)) return null;
  const row = await dayOutput(scope, {
    feature: feature.id,
    subject: feature.cache.subject(input),
    promptVersion: feature.version,
    policyVersion: POLICY_VERSION,
    model: modelIdFor(feature.tier) ?? "",
  });
  return row ? row.notes : null;
}
