import { appendFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { beforeEach, describe, it } from "vitest";

import { collection } from "@ambient/db";

import type { AiCardData } from "@/lib/ai/cards";

import { signInAs } from "../../tests/support/session";

/**
 * The evaluation harness. Each case signs in as a seeded user, runs one AI
 * feature against the real model (or the smoke stand-in), turns the result
 * into an Observation and applies fixed checks to it. Results go to
 * evals/results/cases.jsonl; the global teardown scores them.
 */

export const SMOKE = process.env.AI_EVAL_SMOKE === "1";
export const LIVE = !!process.env.OPENAI_API_KEY && !!process.env.OPENAI_MODEL && !SMOKE;
export const CASES_FILE = fileURLToPath(new URL("../results/cases.jsonl", import.meta.url));

/** What a case's checks look at: the answer's visible text and what came with it. */
export type Observation = {
  ok: boolean;
  /** The refusal or failure reason when not ok. */
  reason: string | null;
  /** Every piece of text the user would read (answer, bullets, points, items, headline). */
  text: string;
  cards: AiCardData[];
  proposals: { kind: string; title: string }[];
  /** Chat: the progress lines, which name the tools used. */
  progress: string[];
  notes: string[];
};

export type Check = { name: string; pass: boolean };

export const emptyObservation = (reason: string): Observation => ({ ok: false, reason, text: "", cards: [], proposals: [], progress: [], notes: [] });

/** Collections the AI writes to; cleared before every case (a throwaway database). */
async function reset() {
  for (const name of ["aiInvocations", "aiOutputs", "aiProposals", "aiConversations", "aiFeedback"] as const) {
    await (await collection(name)).deleteMany({});
  }
}

/** A feature's cases. Skipped, with a note in the report, when there's no model to run against. */
export function evalSuite(feature: string, body: () => void) {
  describe.skipIf(!SMOKE && !LIVE)(`eval: ${feature}`, () => {
    beforeEach(reset);
    body();
  });
}

export function evalCase(def: {
  id: string;
  feature: string;
  user: string;
  /** Plant records for this case (the database is reseeded per file, not per case). */
  setup?: () => Promise<void>;
  run: () => Promise<Observation>;
  checks: (o: Observation) => Check[];
}) {
  it(
    def.id,
    async () => {
      signInAs(def.user);
      await def.setup?.();
      const started = Date.now();
      let observation: Observation;
      let error: string | null = null;
      try {
        observation = await def.run();
      } catch (e) {
        error = e instanceof Error ? e.message : String(e);
        observation = emptyObservation("threw");
      }
      const latencyMs = Date.now() - started;
      const calls = await (await collection("aiInvocations")).find({}).toArray();
      const tokens = calls.reduce((t, r) => ({ input: t.input + r.inputTokens, output: t.output + r.outputTokens }), { input: 0, output: 0 });
      const checks = error ? [{ name: "ran without an error", pass: false }] : def.checks(observation);
      const passed = checks.every((c) => c.pass);
      appendFileSync(CASES_FILE, `${JSON.stringify({ id: def.id, feature: def.feature, passed, checks, tokens, latencyMs, error })}\n`);
      const failed = checks.filter((c) => !c.pass).map((c) => c.name);
      // The eval's own report, straight to the terminal (Vitest holds back console output from tests).
      process.stdout.write(`${passed ? "pass" : "FAIL"}  ${def.feature} · ${def.id}${failed.length ? `  ✗ ${failed.join("; ")}` : ""}
`);
    },
    180_000,
  );
}

/** The card's main label, for checks: a task's title, an account's or contact's name, and so on. */
export function cardLabel(c: AiCardData): string {
  switch (c.kind) {
    case "account":
    case "contract":
    case "contact":
      return c.name;
    case "task":
    case "notification":
      return c.title;
    case "visit":
      return `${c.typeLabel} ${c.account} ${c.purpose}`;
    case "interaction":
      return `${c.typeLabel} ${c.summary}`;
  }
}

/** All string values of an output except handles in `sources`. */
export function textOf(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(textOf).join("\n");
  if (value && typeof value === "object") {
    return Object.entries(value)
      .filter(([k]) => k !== "sources")
      .map(([, v]) => textOf(v))
      .join("\n");
  }
  return "";
}
