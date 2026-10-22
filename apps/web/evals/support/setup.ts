/**
 * Runs before every eval file, after the integration harness has pointed the
 * app at a fresh throwaway database. In smoke mode the model is the smoke
 * stand-in; otherwise it is the real OpenAI client, untouched.
 */
import { vi } from "vitest";

if (process.env.AI_EVAL_SMOKE === "1") {
  process.env.OPENAI_API_KEY ??= "smoke";
  process.env.OPENAI_MODEL ??= "smoke";
}

vi.mock("@/lib/ai/client", async (importOriginal) => {
  if (process.env.AI_EVAL_SMOKE !== "1") return importOriginal();
  const { smokeModel } = await import("./smoke");
  return { modelFor: () => ({ model: smokeModel, modelId: "smoke" }) };
});
