import "server-only";

import { NoObjectGeneratedError, Output, generateText, stepCountIs, tool, type ModelMessage, type ToolSet } from "ai";
import { z } from "zod";

import type { RoleKey } from "@ambient/db";
import { createLogger } from "@ambient/logger";

import { getScope } from "@/lib/data/scope";

import { estimateTokens, reserveTokens, settleTokens } from "./budget";
import { ChatRequestSchema, type ChatTurnView } from "./chat-view";
import { modelFor } from "./client";
import { type AiTier } from "./config";
import { getConversation, newTurn, saveExchange, toTurnView } from "./conversations";
import { ROLE_LABEL, addUsage, citedSources, errorKind, type ErrorKind } from "./engine";
import { factsBuilder } from "./facts";
import { plainText } from "./features/text";
import { REFUSAL_MESSAGE, checkAccess, checkLimits, type AiRefusal } from "./gates";
import { logInvocation } from "./log";
import { POLICY_VERSION, policyPrompt, promptContext } from "./prompts/policy";
import { WREN_CHAT_TASK, WREN_CHAT_VERSION } from "./prompts/wren-chat";
import { READ_TOOLS } from "./tools/read";
import type { ToolResult } from "./tools/define";
import { verifySources } from "./verify";

/**
 * One Wren chat question, end to end:
 *
 *   input → scope → access → conversation → limits → budget
 *         → model with read tools (at most 4 calls, each as the user)
 *         → verify against this turn's tool results → limit → save → log
 *
 * Progress lines go out as tools run; the answer only after verification.
 * Nothing here writes CRM data.
 */

export const WREN_CHAT = { id: "wren-chat", roles: ["user", "manager", "senior", "lead"] as RoleKey[], tier: "fast" as AiTier };
export const CHAT_LIMITS = { toolCalls: 4, contextExchanges: 6, answerChars: 400, bullets: 5, bulletChars: 160, followUpChars: 200 } as const;
const TURN_TIMEOUT_MS = 30_000;
const MAX_OUTPUT_TOKENS = 800;

const Claim = z.object({ text: z.string(), sources: z.array(z.string()) });
export const ChatOutput = z.object({ answer: Claim, bullets: z.array(Claim), followUpQuestion: z.string().nullable() });
type ChatOutputT = z.infer<typeof ChatOutput>;

export type ChatResult = { ok: true; conversationId: string; question: ChatTurnView; answer: ChatTurnView } | { ok: false; reason: string; message: string };

const TRY_AGAIN = "Couldn't answer that right now. Try again in a moment.";
const LIMIT_ASK = "I've looked up as much as I can for one question. Ask about one thing at a time.";

/** Earlier turns as plain text: their handles mean nothing outside their own turn. */
function contextMessages(turns: { role: "user" | "assistant"; text: string; bullets: string[] }[]): ModelMessage[] {
  return turns.slice(-CHAT_LIMITS.contextExchanges * 2).map((t) => ({
    role: t.role,
    content: t.bullets.length ? `${t.text}\n${t.bullets.map((b) => `- ${b}`).join("\n")}` : t.text,
  }));
}

export async function runChatTurn(rawInput: unknown, onProgress: (text: string) => void = () => {}): Promise<ChatResult> {
  const parsed = ChatRequestSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, reason: "invalid_input", message: parsed.error.issues[0]?.message ?? "That request isn't valid." };
  const { conversationId, message } = parsed.data;
  const scope = await getScope();
  const log = createLogger("ai", { tenantId: scope.tenantId, userId: scope.user._id });

  const base = { feature: WREN_CHAT.id, promptVersion: WREN_CHAT_VERSION, policyVersion: POLICY_VERSION, tier: WREN_CHAT.tier };
  const refuse = async (refusal: AiRefusal): Promise<ChatResult> => {
    await logInvocation(scope, { ...base, model: null, inputTokens: 0, outputTokens: 0, latencyMs: 0, attempts: 0, outcome: "refused", refusal, errorKind: null });
    return { ok: false, reason: refusal, message: REFUSAL_MESSAGE[refusal] };
  };

  const denied = await checkAccess(scope, WREN_CHAT);
  if (denied) return refuse(denied);

  const conversation = conversationId ? await getConversation(scope, conversationId) : null;
  if (conversationId && !conversation) return { ok: false, reason: "not_found", message: "That conversation isn't available. Start a new chat." };

  const limited = await checkLimits(scope);
  if (limited) return refuse(limited);

  const instructions = `${policyPrompt(
    promptContext({ tenantName: scope.user.tenant.name, userName: scope.user.name, roleLabel: ROLE_LABEL[scope.user.role], timeZone: scope.timeZone }),
  )}\n\n${WREN_CHAT_TASK}`;
  const messages: ModelMessage[] = [...contextMessages(conversation?.turns ?? []), { role: "user", content: message }];

  // Every tool in this turn shares one builder, so handles never collide.
  const f = factsBuilder();
  const results: ToolResult[] = [];
  const ctx = { scope, f, team: scope.user.capabilities.manager || scope.reps.all };
  let calls = 0;
  const tools: ToolSet = Object.fromEntries(
    READ_TOOLS.map((t) => [
      t.name,
      tool({
        description: t.description,
        inputSchema: t.input as z.ZodType<Record<string, unknown>>,
        execute: async (input: Record<string, unknown>): Promise<ToolResult> => {
          if (++calls > CHAT_LIMITS.toolCalls) return { ok: false, reason: "limit", ask: LIMIT_ASK };
          const checked = t.input.safeParse(input);
          if (!checked.success) return { ok: false, reason: "invalid", ask: "I couldn't use that lookup. Rephrase the question." };
          onProgress((t.progress as (i: unknown) => string)(checked.data));
          try {
            const result = await (t.run as (c: typeof ctx, i: unknown) => Promise<ToolResult>)(ctx, checked.data);
            results.push(result);
            return result;
          } catch (err) {
            log.error({ err, tool: t.name }, "AI tool failed");
            return { ok: false, reason: "invalid", ask: "That lookup failed. Try again in a moment." };
          }
        },
      }),
    ]),
  );

  const chars = instructions.length + messages.reduce((n, m) => n + String(m.content).length, 0);
  // Each tool step sends the conversation again, so reserve for every step.
  const estimate = estimateTokens(chars, MAX_OUTPUT_TOKENS) * (CHAT_LIMITS.toolCalls + 1);
  const month = await reserveTokens(scope, estimate);
  if (!month) return refuse("budget_exhausted");

  const { model, modelId } = modelFor(WREN_CHAT.tier);
  const usage = { input: 0, output: 0 };
  const started = Date.now();
  let output: ChatOutputT | undefined;
  let failure: ErrorKind | null = null;
  let steps = 0;
  try {
    const result = await generateText({
      model,
      instructions,
      messages,
      tools,
      stopWhen: stepCountIs(CHAT_LIMITS.toolCalls + 1),
      output: Output.object({ schema: ChatOutput, name: "wren_answer" }),
      temperature: 0.2,
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      maxRetries: 1,
      timeout: TURN_TIMEOUT_MS,
      providerOptions: { openai: { strictJsonSchema: true } },
    });
    addUsage(usage, result.totalUsage);
    steps = result.steps.length;
    output = result.output as ChatOutputT;
  } catch (e) {
    if (NoObjectGeneratedError.isInstance(e)) addUsage(usage, e.usage);
    failure = errorKind(e);
  } finally {
    await settleTokens(scope, month, estimate, usage.input + usage.output);
  }
  const metrics = { ...base, model: modelId, inputTokens: usage.input, outputTokens: usage.output, latencyMs: Date.now() - started, attempts: Math.max(steps, 1), refusal: null };

  if (!output) {
    log.warn({ feature: WREN_CHAT.id, model: modelId, errorKind: failure ?? "unknown" }, "AI call failed");
    await logInvocation(scope, { ...metrics, outcome: "failed", errorKind: failure ?? "unknown" });
    return { ok: false, reason: "failed", message: TRY_AGAIN };
  }

  // Verify against what the tools returned in this turn, and nothing else.
  const packet = f.build({ results });
  let shown: ChatOutputT;
  let repaired = false;
  const uncited = packet.handles.size === 0;
  if (uncited) {
    // Nothing was found (or nothing was looked up): an answer without records, and no bullets to cite.
    shown = { answer: { text: output.answer.text, sources: [] }, bullets: [], followUpQuestion: output.followUpQuestion };
  } else {
    const verified = verifySources(output, packet.handles);
    if (!verified.output.answer) {
      await logInvocation(scope, { ...metrics, outcome: "rejected", errorKind: null });
      return { ok: false, reason: "rejected", message: TRY_AGAIN };
    }
    shown = verified.output;
    repaired = verified.removed > 0;
  }

  const text = plainText(shown.answer.text, CHAT_LIMITS.answerChars);
  if (!text) {
    await logInvocation(scope, { ...metrics, outcome: "rejected", errorKind: null });
    return { ok: false, reason: "rejected", message: TRY_AGAIN };
  }
  const bullets = shown.bullets
    .map((b) => ({ ...b, text: plainText(b.text, CHAT_LIMITS.bulletChars) }))
    .filter((b) => b.text)
    .slice(0, CHAT_LIMITS.bullets);
  const followUp = shown.followUpQuestion ? plainText(shown.followUpQuestion, CHAT_LIMITS.followUpChars) || null : null;
  const cards = citedSources({ answer: shown.answer, bullets }).flatMap((h) => packet.cards.get(h) ?? []);

  const question = newTurn({ role: "user", text: message, bullets: [], followUpQuestion: null, cards: [], uncited: false });
  const answer = newTurn({ role: "assistant", text, bullets: bullets.map((b) => b.text), followUpQuestion: followUp, cards, uncited });
  const savedId = await saveExchange(scope, conversation?._id ?? null, question, answer);
  await logInvocation(scope, { ...metrics, outcome: repaired ? "repaired" : "ok", errorKind: null });
  if (!savedId) return { ok: false, reason: "not_found", message: "That conversation isn't available. Start a new chat." };
  return { ok: true, conversationId: savedId, question: toTurnView(question), answer: toTurnView(answer) };
}
