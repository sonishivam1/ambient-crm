import "server-only";

import { APICallError, NoObjectGeneratedError, Output, generateText, type LanguageModelUsage } from "ai";
import type { z } from "zod";

import type { AI_ERROR_KINDS, RoleKey } from "@ambient/db";
import { createLogger } from "@ambient/logger";

import { getScope, type Scope } from "@/lib/data/scope";

import { estimateTokens, reserveTokens, settleTokens } from "./budget";
import { modelFor } from "./client";
import { CALL_TIMEOUT_MS, type AiTier } from "./config";
import type { AiCardData } from "./cards";
import { renderFacts, type FactPacket } from "./facts";
import { REFUSAL_MESSAGE, checkGates, type AiRefusal } from "./gates";
import { logInvocation } from "./log";
import { POLICY_VERSION, policyPrompt, promptContext } from "./prompts/policy";
import { verifySources } from "./verify";

/**
 * The AI engine. Every AI capability in Ambient is a definition run by
 * runAiFeature(), which applies the same safety layer to all of them:
 *
 *   input → scope → gates → facts → budget → model call → verify → settle → log
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
};

export function defineAiFeature<I, O>(feature: AiFeature<I, O>): AiFeature<I, O> {
  return feature;
}

export type AiFailure = AiRefusal | "invalid_input" | "not_found" | "rejected" | "failed";

export type AiResult<O> =
  | {
      ok: true;
      output: O;
      /** "repaired" when invented sources were dropped or a retry was needed. */
      outcome: "ok" | "repaired";
      /** Handles the verified output cites, in order. */
      sources: string[];
      /** The cited records as cards, in the same order: what the user sees beside the text. */
      cards: AiCardData[];
    }
  | { ok: false; reason: AiFailure; message: string };

const TRY_AGAIN = "Couldn't generate this right now. Try again in a moment.";
const NOT_FOUND = "That record isn't available.";
const ROLE_LABEL: Record<RoleKey, string> = {
  user: "Account manager",
  manager: "Manager",
  senior: "Senior manager",
  lead: "Lead",
  admin: "Administrator",
  super: "Super admin",
};
const RETRY_NOTE = "\n\nYour previous reply did not match the required output format. Reply again, following it exactly.";

type ErrorKind = (typeof AI_ERROR_KINDS)[number];

/** A code for the log. Error messages are never logged: they can echo provider responses. */
function errorKind(e: unknown): ErrorKind {
  if (NoObjectGeneratedError.isInstance(e)) return "schema";
  if (APICallError.isInstance(e)) return "provider";
  const name = e instanceof Error ? e.name : "";
  if (/abort|timeout/i.test(name)) return "timeout";
  return "unknown";
}

function addUsage(total: { input: number; output: number }, usage: LanguageModelUsage | undefined) {
  total.input += usage?.inputTokens ?? 0;
  total.output += usage?.outputTokens ?? 0;
}

function citedSources(value: unknown, into: string[] = []): string[] {
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

/** Run one AI feature for the signed-in user. Never throws for expected failures. */
export async function runAiFeature<I, O>(feature: AiFeature<I, O>, rawInput: unknown): Promise<AiResult<O>> {
  const parsed = feature.input.safeParse(rawInput);
  if (!parsed.success) return { ok: false, reason: "invalid_input", message: "That request isn't valid." };
  const input = parsed.data;
  const scope = await getScope();

  const base = { feature: feature.id, promptVersion: feature.version, policyVersion: POLICY_VERSION, tier: feature.tier };
  const refuse = async (refusal: AiRefusal): Promise<AiResult<O>> => {
    await logInvocation(scope, { ...base, model: null, inputTokens: 0, outputTokens: 0, latencyMs: 0, attempts: 0, outcome: "refused", refusal, errorKind: null });
    return { ok: false, reason: refusal, message: REFUSAL_MESSAGE[refusal] };
  };

  const refusal = await checkGates(scope, feature);
  if (refusal) return refuse(refusal);

  const facts = await feature.facts(scope, input);
  // Out of scope, another tenant's or missing: the same answer, and no model call.
  if (!facts) {
    createLogger("ai", { tenantId: scope.tenantId, userId: scope.user._id }).info({ feature: feature.id, reason: "not_found" }, "AI request for a record that isn't visible");
    return { ok: false, reason: "not_found", message: NOT_FOUND };
  }
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
  const outcome = verified.removed > 0 || attempts > 1 ? "repaired" : "ok";
  await logInvocation(scope, { ...metrics, outcome, errorKind: null });
  const sources = citedSources(verified.output);
  const cards = sources.flatMap((h) => facts.cards.get(h) ?? []);
  return { ok: true, output: verified.output, outcome, sources, cards };
}
