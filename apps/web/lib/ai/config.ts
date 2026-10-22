import type { AI_TIERS } from "@ambient/db/models";

/**
 * AI settings, read from the environment on every use (never at import), so a
 * module that imports the engine needs no key until it actually calls OpenAI.
 * Nothing here is ever logged.
 */

export type AiTier = (typeof AI_TIERS)[number];

/** Per-user request limits. */
export const RATE_LIMIT = { perMinute: 10, perDay: 200 } as const;

/** Default time limit for one model call. */
export const CALL_TIMEOUT_MS = 20_000;

function setting(name: string): string | null {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

/** The OpenAI model for a tier. `strong` falls back to `fast` when it isn't set. */
export function modelIdFor(tier: AiTier): string | null {
  const fast = setting("OPENAI_MODEL");
  return tier === "strong" ? (setting("OPENAI_MODEL_STRONG") ?? fast) : fast;
}

/** True when a key and a default model are set. */
export function aiConfigured(): boolean {
  return setting("OPENAI_API_KEY") !== null && modelIdFor("fast") !== null;
}

/** The API key, for the client only. */
export function openAiKey(): string | null {
  return setting("OPENAI_API_KEY");
}

/**
 * Prices for the admin report's cost estimate, in USD per million tokens, from
 * OPENAI_PRICE_INPUT_PER_M and OPENAI_PRICE_OUTPUT_PER_M (set them from
 * OpenAI's pricing page for the model in use). Null when not set: the report
 * then shows tokens only, rather than a guessed price.
 */
export function tokenPrices(): { input: number; output: number } | null {
  const input = Number(setting("OPENAI_PRICE_INPUT_PER_M"));
  const output = Number(setting("OPENAI_PRICE_OUTPUT_PER_M"));
  return setting("OPENAI_PRICE_INPUT_PER_M") && setting("OPENAI_PRICE_OUTPUT_PER_M") && input >= 0 && output >= 0 ? { input, output } : null;
}
