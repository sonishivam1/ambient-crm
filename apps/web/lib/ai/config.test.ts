import { afterEach, describe, expect, it } from "vitest";

import { aiConfigured, modelIdFor } from "./config";

const saved = { ...process.env };
afterEach(() => {
  for (const k of ["OPENAI_API_KEY", "OPENAI_MODEL", "OPENAI_MODEL_STRONG"]) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("AI config", () => {
  it("needs both a key and a default model", () => {
    delete process.env.OPENAI_API_KEY;
    process.env.OPENAI_MODEL = "m-fast";
    expect(aiConfigured()).toBe(false);
    process.env.OPENAI_API_KEY = "  ";
    expect(aiConfigured()).toBe(false);
    process.env.OPENAI_API_KEY = "sk-test";
    expect(aiConfigured()).toBe(true);
    delete process.env.OPENAI_MODEL;
    expect(aiConfigured()).toBe(false);
  });

  it("uses the strong model when set, and falls back to the fast one", () => {
    process.env.OPENAI_MODEL = "m-fast";
    delete process.env.OPENAI_MODEL_STRONG;
    expect(modelIdFor("strong")).toBe("m-fast");
    process.env.OPENAI_MODEL_STRONG = "m-strong";
    expect(modelIdFor("strong")).toBe("m-strong");
    expect(modelIdFor("fast")).toBe("m-fast");
  });
});
