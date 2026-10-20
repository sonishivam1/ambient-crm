# AI step 1: engine core

**Status:** Built (`c36a1b7`)
**Agreed:** 20 Oct 2026 · **Built:** 20 Oct 2026

## Goal
Build the foundation every AI feature will run on, and prove it is secure,
before any feature exists. Nothing visible to users; everything tested with the
test-only stand-in, so no OpenAI key is needed. Design:
[AI layer](../architecture/ai.md).

## Scope

| Piece | What it does |
| --- | --- |
| Dependencies | `ai` (Vercel AI SDK) and `@ai-sdk/openai`, pinned |
| `lib/ai/config.ts` | `OPENAI_API_KEY`, `OPENAI_MODEL`, `OPENAI_MODEL_STRONG`, read on use; `aiConfigured()` |
| `lib/ai/client.ts` | `modelFor(tier)`: the only file importing `@ai-sdk/openai` |
| Tenant AI policy | `tenants.ai = { enabled, roles, features, monthlyTokenBudget }`, off by default |
| `aiInvocations` | One row per request: feature, versions, model, tier, tokens, time, attempts, outcome; no text fields |
| `aiUsage` | Monthly token ledger per tenant; atomic reserve and settle |
| `lib/ai/gates.ts` | Not configured, AI off, feature off, role, rate limit, budget |
| `lib/ai/engine.ts` | `defineAiFeature`, `runAiFeature`: input, scope, gates, facts, budget, call, verify, settle, log |
| `lib/ai/verify.ts` | Drop claims citing handles not in this call's facts; reject if none remain |
| `lib/ai/prompts/policy.ts` | The policy prompt v1 with tenant, user, role, today and this week's calendar |
| Test-only stand-in | On the AI SDK's own mock model; swapped in by tests only |

Not in scope: fact sources and cards (step 2), caching and the first feature
(step 3), any screen.

## Decisions
- **Demo data:** AI on for Northwind (roles user, manager, senior, lead), off
  for Harbor & Finch, proving off by default.
- **Rate limits:** 10 requests a minute and 200 a day per user.
- **Demo budget:** 2,000,000 tokens a month for Northwind.
- **Refusals are logged** with zero tokens, but don't count towards rate limits.

## Tests
- No key, AI off, feature off, admin role: refused, no call made, no budget used.
- Spent budget refused; five concurrent calls against room for two let exactly
  two through.
- Rate limit per minute and per day; refusals don't count.
- The stand-in records exactly what would be sent: a rep's call holds only
  their accounts, no other rep's or tenant's, no real ids.
- Injection text inside customer text stays inside one `<untrusted>` fence.
- Invented handles dropped; all-invented replies rejected; wrong shape gets one
  retry, then fails gracefully.
- Time limit releases the reserved budget; provider error text never shown.
- Log rows hold metadata only: no prompt, facts, reply or key.

## Docs to update
AI layer (status, engine details, code layout), data model, server API,
testing, features, roadmap, README, CLAUDE.md.

## As built
- **Changed from the plan:** the stand-in lives in
  `tests/support/ai-stand-in.ts` (not `lib/ai/testing/`), so it can never be
  bundled with the app. A `policyVersion` field was added to `aiInvocations`
  so policy prompt changes are traceable separately from feature prompts.
- **AI SDK 7** has no `generateObject`: structured output is `generateText`
  with `Output.object`; `system` is now `instructions`; the test mock is
  `MockLanguageModelV4`. Learned from the installed type definitions.
- **Verified:** 14 integration and 15 unit tests; 24 db and 165 web tests in
  total; lint, typecheck and build clean; CI green. Breaking the budget's
  atomic check or the role gate makes the suite fail.
- **Lessons:** a test expecting a calendar week was wrong about which weekday
  20 Oct 2026 is; trust the date maths, check the test. Node's own DNS
  resolver failed Atlas SRV lookups while Windows resolved them; a one-off
  `dns.setServers` preload got the reseed through.
