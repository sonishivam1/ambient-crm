/**
 * Once per `pnpm ai:eval`: clears the case log before the run, then scores it
 * and writes evals/results/latest.json (smoke.json in smoke mode, which never
 * becomes a baseline), printing a table per feature.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { summarise } from "../score.mjs";

const results = fileURLToPath(new URL("../results/", import.meta.url));
const casesFile = `${results}cases.jsonl`;

function prices() {
  const input = Number(process.env.OPENAI_PRICE_INPUT_PER_M);
  const output = Number(process.env.OPENAI_PRICE_OUTPUT_PER_M);
  return process.env.OPENAI_PRICE_INPUT_PER_M && process.env.OPENAI_PRICE_OUTPUT_PER_M && input >= 0 && output >= 0 ? { input, output } : null;
}

export default function setup() {
  mkdirSync(results, { recursive: true });
  writeFileSync(casesFile, "");

  return function teardown() {
    const smoke = process.env.AI_EVAL_SMOKE === "1";
    const lines = existsSync(casesFile) ? readFileSync(casesFile, "utf8").split("\n").filter(Boolean) : [];
    if (!lines.length) {
      console.log("\nNo evaluation cases ran. Set OPENAI_API_KEY and OPENAI_MODEL to run them against the real model, or AI_EVAL_SMOKE=1 to check the harness.\n");
      return;
    }
    const cases = lines.map((l) => JSON.parse(l));
    const report = {
      model: smoke ? "smoke" : (process.env.OPENAI_MODEL ?? "unknown"),
      ranAt: new Date().toISOString(),
      smoke,
      features: summarise(cases, prices()),
      cases,
    };
    writeFileSync(`${results}${smoke ? "smoke" : "latest"}.json`, `${JSON.stringify(report, null, 2)}\n`);
    console.log(`\nEvaluation (${report.model}${smoke ? ", smoke: scores mean nothing" : ""})`);
    for (const [feature, f] of Object.entries(report.features)) {
      const cost = f.costPerAnswer == null ? "" : `  ~$${f.costPerAnswer} per answer`;
      console.log(
        `  ${feature.padEnd(22)} score ${f.score.toFixed(3)}  cases ${f.casesPassed}/${f.cases}  checks ${f.checksPassed}/${f.checks}  tokens ${f.inputTokens}/${f.outputTokens}  avg ${(f.avgLatencyMs / 1000).toFixed(1)}s${cost}`,
      );
    }
    console.log(smoke ? "" : "\nCompare with the baseline: pnpm ai:eval:compare\n");
  };
}
