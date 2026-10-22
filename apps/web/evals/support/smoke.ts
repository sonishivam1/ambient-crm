import { MockLanguageModelV4 } from "ai/test";

/**
 * The smoke stand-in: answers every call with the smallest reply that fits
 * the feature's output schema, so the cases run end to end without a key.
 * Scores from a smoke run mean nothing and are never saved as a baseline.
 */

const USAGE = {
  inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 5, text: 5, reasoning: undefined },
};

function replyFor(schema: unknown): object {
  const props = (schema as { properties?: Record<string, unknown> } | undefined)?.properties ?? {};
  if ("points" in props) return { points: [], nextStep: null };
  if ("items" in props) return { items: [] };
  if ("suggestions" in props) return { suggestions: [] };
  return { answer: { text: "Smoke reply.", sources: [] }, bullets: [], followUpQuestion: null };
}

export const smokeModel = new MockLanguageModelV4({
  provider: "smoke",
  modelId: "smoke",
  doGenerate: async (options) => {
    const format = options.responseFormat as { type: string; schema?: unknown } | undefined;
    return {
      content: [{ type: "text", text: JSON.stringify(replyFor(format?.schema)) }],
      finishReason: { unified: "stop", raw: undefined },
      usage: USAGE,
      warnings: [],
    };
  },
});
