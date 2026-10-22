export type FeatureScore = {
  cases: number;
  casesPassed: number;
  checks: number;
  checksPassed: number;
  inputTokens: number;
  outputTokens: number;
  score: number;
  avgLatencyMs: number;
  costPerAnswer: number | null;
};

export type CaseLike = { feature: string; passed: boolean; checks: { pass: boolean }[]; tokens: { input: number; output: number }; latencyMs: number };
export type RunReport = { model: string; ranAt: string; smoke: boolean; features: Record<string, FeatureScore> };

export const LATEST: string;
export const BASELINE: string;
export function summarise(cases: CaseLike[], prices?: { input: number; output: number } | null): Record<string, FeatureScore>;
export function compare(
  baseline: Pick<RunReport, "features">,
  latest: Pick<RunReport, "features" | "smoke">,
): { ok: boolean; rows: { feature: string; baseline: number; latest: number | null; ok: boolean }[]; reason?: string };
