import { describe, expect, it } from "vitest";

import { compare, summarise } from "./score.mjs";

const c = (feature: string, checks: boolean[], tokens = { input: 1000, output: 200 }, latencyMs = 1000) => ({
  feature,
  passed: checks.every(Boolean),
  checks: checks.map((pass) => ({ pass })),
  tokens,
  latencyMs,
});

describe("evaluation scores", () => {
  it("score each feature by the share of checks passed, with cases, tokens, time and cost", () => {
    const f = summarise([c("chat", [true, true, false]), c("chat", [true]), c("brief", [false, false])], { input: 0.4, output: 1.6 });
    expect(f.chat).toMatchObject({ cases: 2, casesPassed: 1, checks: 4, checksPassed: 3, score: 0.75, inputTokens: 2000, outputTokens: 400, avgLatencyMs: 1000 });
    // (2000 × 0.4 + 400 × 1.6) / 1M / 2 answers
    expect(f.chat!.costPerAnswer).toBeCloseTo(0.00072, 5);
    expect(f.brief).toMatchObject({ score: 0, casesPassed: 0 });
    expect(summarise([c("chat", [true])]).chat!.costPerAnswer).toBeNull();
  });

  it("gate: every feature must score at least its baseline", () => {
    const baseline = { features: { chat: { score: 0.8 }, brief: { score: 0.9 } } } as never;
    expect(compare(baseline, { smoke: false, features: { chat: { score: 0.8 }, brief: { score: 0.95 } } } as never)).toMatchObject({ ok: true });
    const lower = compare(baseline, { smoke: false, features: { chat: { score: 0.79 }, brief: { score: 0.95 } } } as never);
    expect(lower.ok).toBe(false);
    expect(lower.rows.find((r) => r.feature === "chat")).toMatchObject({ ok: false, latest: 0.79 });
    // A feature missing from the run fails the gate too.
    expect(compare(baseline, { smoke: false, features: { chat: { score: 1 } } } as never).ok).toBe(false);
  });

  it("never gates on a smoke run", () => {
    expect(compare({ features: {} } as never, { smoke: true, features: {} } as never)).toMatchObject({ ok: false, reason: expect.stringContaining("smoke") });
  });
});
