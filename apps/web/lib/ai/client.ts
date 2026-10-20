import "server-only";

import { createOpenAI, type OpenAIProvider } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";

import { modelIdFor, openAiKey, type AiTier } from "./config";

/*
 * The only file in Ambient that talks to the model provider. Everything else
 * goes through the engine (lib/ai/engine.ts), which calls modelFor(). Tests
 * replace this module with the stand-in model; app code has no test hook.
 */

let provider: { key: string; openai: OpenAIProvider } | undefined;

/** The OpenAI model for a tier. Throws if AI isn't configured; the engine's gates check that first. */
export function modelFor(tier: AiTier): { model: LanguageModel; modelId: string } {
  const key = openAiKey();
  const modelId = modelIdFor(tier);
  if (!key || !modelId) throw new Error("AI is not configured.");
  // Rebuild only if the key changed (for example after rotating it).
  if (!provider || provider.key !== key) provider = { key, openai: createOpenAI({ apiKey: key }) };
  return { model: provider.openai(modelId), modelId };
}
