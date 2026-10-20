# AI step 3: account summary

**Status:** Built
**Agreed:** 20 Oct 2026 · **Built:** 20 Oct 2026

## Goal
The first AI feature people can use: **Generate** on a customer profile's Wren
summary card writes a short, cited briefing on the account, with the records it
used shown as cards. It runs on the engine (step 1) and the account fact source
and cards (step 2), and adds the cache every later feature reuses. Design:
[AI layer](../architecture/ai.md); prompt: [AI prompts](../architecture/ai-prompts.md).

## Scope

### The feature (`lib/ai/features/account-summary.ts`)
| Part | Choice |
| --- | --- |
| Id, version | `account-summary`, prompt v1 (`prompts/account-summary.ts`, matching ai-prompts.md) |
| Roles | user, manager, senior, lead (the tenant's policy narrows further) |
| Input | `{ accountId }` |
| Facts | `accountFacts` (step 2) |
| Output | `points` (section `status`, `attention` or `activity`; text; sources) and `nextStep` (text, sources, or null) |
| Limits after verification | at most 7 points, in section order; each text cut to 240 characters; markup and printed handles removed |
| Tier, temperature, output cap | `fast`, 0.2, 700 tokens |

### Gaps computed in code (not by the model)
`accountFacts` gains `notOnRecord`: plain statements of what is missing, worked
out from the records, e.g. "No visit planned", "No completed visit in the last
90 days", "Nothing logged in the last 30 days", "No open tasks", "No active
contacts", "No active contract". The model sees them as facts (so it doesn't
claim the opposite), and the card lists them under "Not on record". The model
never writes a gap, so a gap can't be invented.

### Cache (`aiOutputs`)
- One row per **user**, feature and subject (the account): the verified
  output, the facts fingerprint, prompt and policy versions, model, created
  and expiry times.
- Used only when the fingerprint, both versions and the model all match; at
  most **7 days** old (a TTL index deletes rows after that).
- Facts are always rebuilt under the user's current scope first, so a user who
  lost access gets "not found", never a cached answer.
- **Stale summaries are hidden:** when the facts have changed, the old text is
  not shown (its handles may now point at different records); the card says
  the account has changed and offers Generate.
- A cache hit costs no tokens and doesn't count towards rate limits; it is
  logged as outcome `cached`. **Refresh** skips the cache.

### Engine changes
- `defineAiFeature` gains optional `cache: { subject, ttlDays }`, `limit`
  (post-verification caps) and `notes` (code-computed lines from the facts,
  returned with the result).
- Gates split: access (key, tenant switch, feature, role) runs before facts;
  limits (rate, budget) only before a model call.
- `runAiFeature(feature, input, { refresh })`; results add `cached`,
  `generatedAt` and `notes`.
- `peekAiFeature(feature, input)`: what a page shows without calling the
  model: unavailable (with the reason), none, stale, or the cached result. It
  writes nothing.

### Surface
- Server action `generateAccountSummary({ accountId, refresh })`, wrapped in
  `loggedAction("ai.accountSummary")`.
- The profile's Wren summary card: Generate; a loading state; the points under
  "Status", "Needs attention" and "Recent activity"; the next step
  highlighted; "Not on record"; the cited records as cards; "Generated 5 min
  ago · Refresh"; friendly messages for every refusal and failure. When AI
  isn't available to the user, the card says why and the button is off.
- Generated only on request: opening a profile never calls the model.
- A preview with a sample answer on `/dev/components`, because the dev app has
  no OpenAI key until key day.

Not in scope: thumbs up/down (step 7), cancelling a running call, the morning
brief (step 4).

## Decisions
- Gaps are computed in code, never written by the model.
- Cache per user, until the facts change, 7 days at most.
- Stale summaries are hidden, not shown with a warning.
- Generated only on request.

## Tests
- Prompt: matches ai-prompts.md; version 1.
- Gaps: each rule, from seeded and adjusted records.
- Feature with the stand-in: verified points with cards; invented handles
  dropped; more than 7 points, long text, markup and printed handles trimmed;
  an account outside scope is "not found" with no call.
- Cache: a second request with the same facts makes no call, costs no tokens,
  is logged `cached` and isn't rate-limited; a changed record, a new prompt or
  policy version, another model or Refresh calls again; a manager's cached
  summary is never served to a rep; AI switched off hides cached output;
  rows expire after 7 days.
- Peek: unavailable, none, stale and ready; writes nothing.
- The action: logged with its name and outcome.

## Docs to update
AI layer, AI prompts, data model, server API, features, testing, roadmap,
build log, CLAUDE.md.

## As built
- Built as planned: `lib/ai/features/account-summary.ts` (definition,
  `limitSummary`, `cleanText`, `accountSummaryState`), the prompt in
  `lib/ai/prompts/account-summary.ts`, gaps in `lib/ai/facts/gaps.ts`
  (`notOnRecord` in the account facts), the cache in `lib/ai/cache.ts` on the
  new `aiOutputs` collection, `peekAiFeature` and the split gates
  (`checkAccess`, `checkLimits`) in the engine, the `generateAccountSummary`
  action (`app/actions/ai.ts`), and the profile card
  (`components/ai/account-summary.tsx`) with a sample on `/dev/components`.
- **Changed from the plan:** the gaps are six fixed rules (no visit planned;
  no completed visit in 90 days; nothing logged in 30 days; no open tasks; no
  active contacts; no active contract), counted without the facts' caps.
  Day limits are calendar days on the tenant's calendar. The cache key's
  model is the configured model id, so lookups and saves always agree.
- **Verified:** 11 integration tests (`ai-summary.test.ts`) and 10 unit tests;
  225 web tests in total; lint, typecheck and build clean. Ignoring the
  fingerprint, sharing the cache across users, or counting cached answers
  towards the rate limit each fails the suite. In the browser: the profile
  card says "AI isn't set up yet." with Generate off (the dev app has no key);
  the sample answer checked in light and dark mode.
- **Not yet verified:** a real answer from OpenAI. That waits for key day.
- **Lessons:** 90 × 24 hours isn't 90 calendar days across a daylight-saving
  change; the test now counts days like the code. Tailwind's base layer turns
  list markers off, so the summary's lists set them back.
