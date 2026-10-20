# Build log

How Ambient was built, change by change, newest first: what changed, why, how
it was verified, and what we learned. Read it to understand the product's
history; read [plans/](../plans/) for the plan behind each step and the
[roadmap](../product/roadmap.md) for what comes next.

**Every change adds an entry here** (see the definition of done in
[CLAUDE.md](../../CLAUDE.md)). An entry is short: the commits, what and why,
how it was verified, and any lesson worth keeping.

---

## 20 Oct 2026

### AI step 4: morning brief
- **What:** `/morning-brief`: up to six verified items from the user's day
  (a manager's team), each with its records as cards, under a headline counted
  by code. Kept until local midnight with the cards it was written with (cache
  mode `day`), flagged when the records change; Refresh writes a new one. The
  dashboard tile shows the headline with one cheap read (`latestNotes`).
- **Why:** the second feature proves the engine generalises: a different fact
  source, a second cache mode, and a headline that can't be wrong.
- **Verified:** 8 integration and 7 unit tests; 240 web tests; lint,
  typecheck and build clean; three planted day-cache bugs each fail the
  suite; the page, tile and sample checked in the browser. A real OpenAI
  answer waits for key day; the 7am job waits for hosting.
- **Plan:** [AI step 4](../plans/ai-step-4-morning-brief.md).

### AI step 3: account summary
- **What:** the first AI feature: Generate on a profile's Wren summary card
  writes a cited briefing (status, needs attention, recent activity, one next
  step) with the records used as cards and "Not on record" gaps computed by
  code. A per-user cache (`aiOutputs`) serves it again while the facts are
  unchanged, for 7 days at most; stale answers are hidden. The engine gains
  `peekAiFeature`, split gates (access before facts, limits only before a
  call), and `limit`, `notes` and `cache` hooks.
- **Why:** proves the whole engine on a real screen, and gives every later
  feature caching for free.
- **Verified:** 11 integration and 10 unit tests; 225 web tests; lint,
  typecheck and build clean; three planted cache bugs (fingerprint ignored,
  shared across users, cached hits rate-limited) each fail the suite; the
  card checked in the browser without a key, the sample answer in both modes.
  A real OpenAI answer waits for key day.
- **Lessons:** 90 × 24 hours isn't 90 calendar days across a daylight-saving
  change; Tailwind's base layer removes list markers.
- **Plan:** [AI step 3](../plans/ai-step-3-account-summary.md).

### AI step 2: fact sources and cards
- **What:** `factsBuilder()` (handles, allowed fields per kind, a card kept per
  handle, a fingerprint); `accountFacts` and `myDayFacts` on the pages' read
  models; staff text fenced and cut to 300 characters; cards for accounts,
  tasks, visits, contracts, contacts, interactions and notifications
  (`components/ai/cards/`), previewed on `/dev/components`. The engine returns
  the cited records as `cards` and answers `not_found` for an account the user
  can't see, without calling the model.
- **Why:** every AI feature needs the same two things: facts that can only
  hold what the user may see, and real records to show beside the text.
- **Verified:** 12 integration and 7 unit tests; 205 web tests; lint,
  typecheck and build clean; three planted leaks (contact email, unscoped
  visits, uncited cards) each fail the suite; checked in light and dark mode.
- **Lessons:** a "no space found" index of -1 passed a nearby-word-break
  check; card titles need two lines for bill-tos named "GROUP – SITE".
- **Plan:** [AI step 2](../plans/ai-step-2-fact-sources-and-cards.md).

### Logging and versioned APIs across the whole app
- **What:** request ids on every request (`proxy.ts`); every server action
  wrapped in `loggedAction` (name, duration, outcome); every unhandled server
  error logged once (`instrumentation.ts`); sign-in warnings; `defineRoute()`
  as the only way to write a route (version, Zod input and output, sign-in,
  one error shape, request id, deprecation headers, logging); `GET /api/health`
  and `GET /api/v1/me`; guard tests for no `console`, versioned routes and
  wrapped actions.
- **Why:** the logger and ADR 0007 existed but only the AI engine logged and
  nothing enforced versioning; both now apply everywhere and can't regress.
- **Verified:** 21 new tests; 186 web tests in total; each guard fails on a
  planted violation; live requests and a real server action seen in the log
  with request id, tenant and user.
- **Plan:** [observability and API foundation](../plans/observability-and-api-foundation.md).

### Build log, plans, API versioning, logger
- **What:** this log (backfilled), [plans/](../plans/), `CHANGELOG.md`,
  [ADR 0007](../architecture/decisions/0007-api-versioning.md) (every route
  under `/api/v1`), and `@ambient/logger` (structured, redacted logging).
- **Why:** step plans and lessons lived only in chat sessions and would be
  lost; production needs structured logs that can't leak secrets or customer
  data; HTTP routes arrive with Wren chat, so the versioning rule comes first.
- **Verified:** 9 logger tests; all 24 db and 165 web tests; lint, typecheck
  and build clean; dev and production output checked by hand.
- **Lessons:** pino formats before it serializes, and its bindings formatter
  skips child loggers; redaction had to handle both (the tests caught it).
- **Plan:** [logger](../plans/logger.md).

### AI step 1: engine core · `c36a1b7`
- **What:** `lib/ai/` engine: config, the only OpenAI client, `defineAiFeature` /
  `runAiFeature`, gates (key, tenant switch, feature, role, 10 a minute and 200
  a day per user, budget), the `aiUsage` ledger with atomic reservations,
  facts with handles and untrusted fencing, claim verification, a
  metadata-only `aiInvocations` log, and the policy prompt v1. AI SDK 7 and
  `@ai-sdk/openai` 4, pinned. Tenant AI policy: on for Northwind, off for
  Harbor & Finch.
- **Why:** every AI capability must run through one safety layer before any
  feature exists.
- **Verified:** a test-only stand-in on the SDK's `MockLanguageModelV4`;
  14 integration and 15 unit tests (scope of facts, injection fencing,
  invented handles dropped, retry, time limit, concurrent budget races, rate
  limits, no text or key in logs). Breaking the budget's atomic check or the
  role gate fails the suite.
- **Lessons:** AI SDK 7 dropped `generateObject`; structured output is
  `generateText` with `Output.object`, and `system` became `instructions`.
  Learn a new SDK major from its installed `.d.ts`, not from memory. Node's own
  DNS resolver can fail on Atlas SRV lookups while Windows resolves fine; a
  one-off `dns.setServers` preload fixed the reseed.
- **Plan:** [AI step 1](../plans/ai-step-1-engine-core.md).

### Fix: tenant day test failed late in Sydney's evening · `5a9a274`
- **What:** the test compared each tenant's "today"; between 10pm and midnight
  in Sydney, Auckland is already on the next day. It now compares the same
  calendar day in both zones.
- **Lesson:** a date test must not depend on the time it runs. CI caught it
  because it ran in that window.

### AI design: one engine, prompts, colour diagrams · `50c9f12`
- **What:** ADR 0006 accepted (OpenAI through the AI SDK, fast and strong
  tiers, test-only stand-in, no free models); the AI layer design (building
  blocks, four guarantees, verify-then-show, proposals through existing
  actions); production prompts; colour architecture diagrams.
- **Why:** reviewed against a previous product's AI layer: kept its strengths
  (tools treat the model as untrusted, proposals only Accept can write, cards
  for facts) and fixed its gaps (wiring per feature, free-text summaries, no
  budgets, chat history lost).
- **Lessons:** Mermaid fails on a node id `graph` and on a gantt task starting
  with "Call" (read as the `call` keyword); the roadmap chart had been broken
  since the call cycle commit. Every diagram is now rendered with Mermaid
  before committing.

### Docs: CLAUDE.md guide and README · `66741d6`
- `CLAUDE.md` became the full project guide (rules, definition of done,
  gotchas); `AGENTS.md` points to it.

### Fix: hide the sidebar scrollbar · `ecb1d0c`

### CI · `275c9d4`
- **What:** GitHub Actions on every push and pull request: lint, typecheck,
  unit tests, build, and the integration suite against a throwaway
  `mongodb-atlas-local` container. No secrets.
- **Lesson:** the build is given an unreachable `MONGODB_URI` to prove it never
  needs a database; server settings are read at runtime, never baked in.

### Contracts · `b3c8d4c`
- Renewal bands from end dates on the tenant's calendar; cards per band;
  search, filters, sort; profile card. Completes the Phase 2 core screens.
- **Lesson:** check new tables at 1400px wide; cells don't wrap by default.

## 19 Oct 2026

### Notifications · `f2930ed`
- History by tenant day, unread and type filters, mark read and mark all read;
  account links only while in scope.
- **Lesson:** grey backgrounds on unread rows made cards look striped; one row
  layout with an unread dot reads better.

### Fix: segment controls with links · `ec7cd61`
- **Lesson:** `.seg` styled only buttons; links stacked their icon. Shared
  rules for both.

### Call cycle · `8ab2700`
- Six weeks as a list or week grid, needs closing, history, plan, reschedule,
  cancel, post-visit scorecard; audit rows keep scores, never key points.
- **Lesson:** Turbopack doesn't serve `globals.css` edits until the dev server
  restarts.

### Contacts · `fcfa32d`
- Directory, add, edit, deactivate, profile card, Ctrl K; emails unique per
  tenant; audit never holds names, emails or phones.
- **Lesson:** writing a file without reading it first overwrote an existing
  server action; always check a path exists before writing.

### Tenant settings: divisions, lenses, time zone · `91d51df`
- Each tenant's own divisions and lenses; every "today", "overdue" and date in
  the tenant's zone through `@ambient/db/time`.
- **Lesson:** running unit and integration projects together needed separate
  sequence groups in Vitest.

### Tests on Atlas · `e3e17a1`
- Throwaway `ambient_test_*` databases per test file on the Atlas cluster,
  guarded so `ambient_crm` can never be touched; stale ones cleaned up.

### Customer group page · `7d146c6`

### Tests for everything built so far · `0dc61c7`
- Vitest unit and integration projects; 55 tests. Found and fixed `timeAgo`
  showing "1m" for 30–59 seconds.
- **Decision:** tests ship with every feature from here on.

### Tasks · `6573a59`
- Today and All views, filters, create, edit, assign, cancel; notifications for
  assignees; due dates can't be in the past.

### Customer profile and interactions · `511e685`

### Rename the assistant to Wren · `37a680e`
- The task source value became a neutral `ai` so a future rename never
  touches stored data.

### Accounts list · `91bfe43`

### Multi-tenancy · `d21701e`
- `tenantId` on every document, index and query (ADR 0004); the second demo
  tenant reuses the first's keys on purpose to prove isolation.

### Documentation set · `f7a6d44`

### Seeding Atlas safely · `1550ded`
- `--allow-remote` and `--reset` guards; read-only `db:inspect`.

## 18 Oct 2026

### Scaffold and dashboard · `2ed3214`
- Next.js 16 and MongoDB monorepo, navy and coral design system with light and
  dark mode, app shell, role visibility through `getScope()`, dashboard on
  live data, audited task completion, fictional seed data.
- **Lessons:** a byte-order mark in `package.json` breaks Next and Turbopack
  caches the error; per-user code must run after `connection()` under Cache
  Components.
