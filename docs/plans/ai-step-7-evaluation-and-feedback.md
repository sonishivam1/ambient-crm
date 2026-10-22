# AI step 7: evaluation and feedback

**Status:** Built
**Agreed:** 22 Oct 2026 · **Built:** 22 Oct 2026

## Goal
Know whether Wren is good, before and after release. Before: an evaluation
set runs the AI features against the real model on fictional cases and
scores them; a prompt or model change that scores lower doesn't ship. After:
users rate answers, and admins see how each feature is doing. Design:
[AI layer](../architecture/ai.md).

## Scope

### Evaluation (`pnpm ai:eval`)
- A Vitest project `eval` (`apps/web/evals/*.eval.ts`), never part of
  `pnpm test` or CI. It seeds a fresh throwaway test database like the
  integration tests (never `ambient_crm`) and calls the **real** model; with
  no `OPENAI_API_KEY` it skips with a clear message.
- **Cases** (about 30), one file per feature: account summaries with and
  without activity; a rep's and a manager's brief; chat questions per role,
  empty results, ambiguous names, incomplete requests, out-of-scope questions,
  requests to change data, proposals; follow-ups; and injection attempts
  planted in customer text.
- **Fixed checks only:** each case states what must be true (cites a record,
  never names another rep's account, refuses or asks back, ignores a planted
  instruction, used the right tool, prepared a proposal). No model grades
  another model.
- **Report:** per feature, the share of checks passed and cases passed,
  tokens, latency and estimated cost per answer, printed and written to
  `evals/results/latest.json` (not committed). Run it per model
  (`OPENAI_MODEL=… pnpm ai:eval`) to compare.
- **The gate (by hand):** `pnpm ai:eval:baseline` saves the latest run as
  `evals/baseline.json` (committed); `pnpm ai:eval:compare` fails when any
  feature scores below its baseline. Run on every prompt or model change.
- Between cases the harness clears its throwaway database's request log and
  cache, so rate limits and cached answers don't skew a run; the app gets no
  test hook. `AI_EVAL_SMOKE=1` runs the cases on the test-only stand-in to
  check the harness itself without a key (scores are meaningless then and
  aren't saved).

### Feedback
- 👍 / 👎 on every account summary, morning brief and chat answer. 👎 asks for
  one reason: Wrong, Missing something, Not useful, Unclear. **No comments.**
- `aiFeedback`: one row per user per answer (a later vote replaces it): the
  feature, the answer it rates, the rating and reason, and the prompt and
  policy versions and model that produced the answer. **No text.**
- The server checks the answer is the user's own and still the one shown (a
  regenerated summary can't receive the old one's vote).
- Proposals (chat and follow-ups) need no thumbs: Accept, Edit and Dismiss
  are the feedback, and the report counts them.

### Admin report (`/admin/ai`, admins only, totals only)
- This month, per feature: requests that reached the model, cached answers,
  refusals by reason, failures, tokens, average latency, and estimated cost
  when `OPENAI_PRICE_INPUT_PER_M` and `OPENAI_PRICE_OUTPUT_PER_M` (USD per
  million tokens) are set.
- Feedback per feature and prompt version: votes, share of 👍, top reasons.
- Proposals by origin: prepared, accepted, dismissed, expired.
- The tenant's budget used this month.
- Never any answer, question or customer text.

## Decisions
- Fixed checks only.
- Thumbs and a fixed reason, no comments.
- Admins see totals only.
- The quality gate is run by hand against a committed baseline.

## Tests
- Feedback: saved with versions and model, replaced by a later vote, only on
  the user's own current answer, a 👎 reason required to be one of the four,
  no text stored.
- Admin report: totals match seeded rows; only admins; another tenant's rows
  never counted; no text fields in the result.
- Eval harness: scoring, report and compare logic (unit); the cases run end to
  end in smoke mode.

## Docs to update
AI layer, data model, server API, features, testing, operations, roadmap,
build log, changelog, CLAUDE.md.

## As built
- **Evaluation:** `apps/web/evals/`: the harness (`support/harness.ts`,
  `checks.ts`, `observe.ts`, `setup.ts`, `global.ts`, `smoke.ts`), 26 cases in
  four files (`account-summary`, `morning-brief`, `wren-chat`,
  `followup-suggestions`), and `score.mjs` for scoring and the gate. Scripts:
  `pnpm ai:eval`, `pnpm ai:eval:compare`, `pnpm ai:eval:baseline` (from the
  repo root or `apps/web`). `pnpm test` now runs only the unit and integration
  projects; `evals/results/` is git-ignored.
- **Feedback:** `aiFeedback`; `lib/ai/feedback.ts` (`rateAnswer`, `votesFor`);
  the `rateWrenAnswer` action; `components/ai/feedback.tsx` on summaries,
  briefs and chat answers; each view carries the user's vote. Chat answers now
  record the prompt and policy versions and model that produced them.
- **Admin report:** `/admin/ai` (`lib/data/ai-report.ts`), linked as "AI usage"
  in the admin menu; costs appear once `OPENAI_PRICE_INPUT_PER_M` and
  `OPENAI_PRICE_OUTPUT_PER_M` are set.
- **Changed from the plan:** follow-up suggestions and chat proposals have no
  thumbs; Accept, Edit and Dismiss are their feedback and the report counts
  them. A vote on a cached answer is tied to the moment it was generated, so
  a regenerated summary can't take the old one's vote.
- **Verified:** 6 integration tests (feedback and the report) and 3 unit
  tests (scores and the gate); 284 web tests in total; lint, typecheck and
  build clean. Planted bugs that fail the suite: votes on any answer, other
  tenants counted, the report shown to non-admins. Smoke run: all 26 cases ran
  end to end and wrote `smoke.json` (scores meaningless, never a baseline).
  In the browser: `/admin/ai` is a 404 for a manager and shows this month's
  totals to an admin.
- **Not yet done:** the first real run and the baseline (key day); the thumbs
  on a real answer on screen (they need a generated answer).
- **Lesson:** Vitest holds back `console.log` from tests, so the harness
  writes its per-case lines straight to stdout.
