/**
 * Evaluation scores: summarising a run, and the quality gate against a saved
 * baseline. Plain JavaScript so it runs from the command line:
 *
 *   pnpm ai:eval:compare    fail if any feature scores below evals/baseline.json
 *   pnpm ai:eval:baseline   save evals/results/latest.json as the new baseline
 */
import { copyFileSync, existsSync, readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
export const LATEST = here("./results/latest.json");
export const BASELINE = here("./baseline.json");

/**
 * One feature's numbers from its case results.
 * @param {{ feature: string; passed: boolean; checks: { pass: boolean }[]; tokens: { input: number; output: number }; latencyMs: number }[]} cases
 * @param {{ input: number; output: number } | null} prices USD per million tokens
 */
export function summarise(cases, prices = null) {
  /** @type {Record<string, any>} */
  const features = {};
  for (const c of cases) {
    const f = (features[c.feature] ??= { cases: 0, casesPassed: 0, checks: 0, checksPassed: 0, inputTokens: 0, outputTokens: 0, latencyMs: 0 });
    f.cases += 1;
    f.casesPassed += c.passed ? 1 : 0;
    f.checks += c.checks.length;
    f.checksPassed += c.checks.filter((x) => x.pass).length;
    f.inputTokens += c.tokens.input;
    f.outputTokens += c.tokens.output;
    f.latencyMs += c.latencyMs;
  }
  for (const f of Object.values(features)) {
    f.score = f.checks ? round(f.checksPassed / f.checks) : 0;
    f.avgLatencyMs = f.cases ? Math.round(f.latencyMs / f.cases) : 0;
    delete f.latencyMs;
    f.costPerAnswer = prices && f.cases ? round(((f.inputTokens * prices.input + f.outputTokens * prices.output) / 1_000_000 / f.cases) * 1000) / 1000 : null;
  }
  return features;
}

const round = (n) => Math.round(n * 1000) / 1000;

/**
 * The gate: every feature in the baseline must score at least as well now.
 * @returns {{ ok: boolean; rows: { feature: string; baseline: number; latest: number | null; ok: boolean }[] }}
 */
export function compare(baseline, latest) {
  if (latest.smoke) return { ok: false, rows: [], reason: "The latest run is a smoke run; run pnpm ai:eval with the real model first." };
  const rows = Object.entries(baseline.features).map(([feature, b]) => {
    const now = latest.features[feature]?.score ?? null;
    return { feature, baseline: b.score, latest: now, ok: now !== null && now >= b.score };
  });
  return { ok: rows.every((r) => r.ok), rows };
}

function main(command) {
  if (!existsSync(LATEST)) {
    console.error("No evals/results/latest.json yet. Run pnpm ai:eval first.");
    return 1;
  }
  const latest = JSON.parse(readFileSync(LATEST, "utf8"));
  if (command === "baseline") {
    if (latest.smoke) {
      console.error("The latest run is a smoke run; it can't become the baseline.");
      return 1;
    }
    copyFileSync(LATEST, BASELINE);
    console.log(`Saved the baseline (${latest.model}, ${latest.ranAt}). Commit evals/baseline.json.`);
    return 0;
  }
  if (!existsSync(BASELINE)) {
    console.error("No evals/baseline.json yet. Run pnpm ai:eval:baseline after a good run.");
    return 1;
  }
  const result = compare(JSON.parse(readFileSync(BASELINE, "utf8")), latest);
  if (result.reason) {
    console.error(result.reason);
    return 1;
  }
  for (const r of result.rows) console.log(`${r.ok ? "ok  " : "LOWER"} ${r.feature.padEnd(22)} baseline ${r.baseline.toFixed(3)}  now ${r.latest === null ? "missing" : r.latest.toFixed(3)}`);
  console.log(result.ok ? "Every feature scores at least its baseline." : "A feature scores below its baseline: this change doesn't ship.");
  return result.ok ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(process.argv[2]);
}
