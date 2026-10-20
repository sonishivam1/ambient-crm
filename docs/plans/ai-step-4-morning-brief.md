# AI step 4: morning brief

**Status:** Built
**Agreed:** 20 Oct 2026 · **Built:** 20 Oct 2026

## Goal
A short, cited digest of what needs the user today, on `/morning-brief`, with
its headline on the dashboard's Morning brief tile. Built on `myDayFacts`
(step 2) and the engine, cards and cache (steps 1 to 3). Design:
[AI layer](../architecture/ai.md); prompt: [AI prompts](../architecture/ai-prompts.md).

## Scope

### The feature (`lib/ai/features/morning-brief.ts`)
| Part | Choice |
| --- | --- |
| Id, version | `morning-brief`, prompt v1 (`prompts/morning-brief.ts`, matching ai-prompts.md) |
| Roles | user, manager, senior, lead (as the summary; the tenant's policy narrows further) |
| Input | none: always the signed-in user's day |
| Facts | `myDayFacts` (step 2): a manager's are their team's |
| Output | `items`: kind (`overdue_task`, `visit_today`, `task_due`, `renewal`, `alert`, `quiet_account`), priority (`high`, `normal`, `low`), text, sources |
| Limits after verification | at most 6 items, in urgency order of kind, then priority; text cut to 160 characters; markup and printed handles removed |
| Tier, temperature, output cap | `fast`, 0.2, 600 tokens |

### Computed by code, not the model
- **Headline** from the facts' counts, e.g. "1 overdue task · 1 task due
  today · 1 renewal within 30 days · 3 unread notifications". The model
  writes no headline, so the one line everyone reads can't be wrong.
- **Quiet day:** when every count is zero the headline is "Nothing needs you
  today." and the page says so.

### The day's brief is kept (cache mode `day`)
- Cached per user like the summary, but served **all day** (until local
  midnight in the tenant's zone), even after the records change.
- The row keeps a **snapshot of the cards and the headline** as they were when
  it was written, so the brief stays consistent with itself.
- When the facts have changed since, the page says "As of 7:02 am · some
  items may have changed since" and offers Refresh.
- Access is checked on every view: switching AI off hides it. The brief can
  still mention an account the user stopped seeing earlier that day, until
  midnight, like a printed list.
- The summary keeps its `facts` mode (stale answers hidden).

### Engine changes
- `cache.mode`: `facts` (default) or `day`; rows store `cards` and `notes`;
  answers carry `changed`.
- `peekAiFeature` handles both modes; `latestNotes()` reads a cached
  answer's notes without building facts (for the dashboard tile).
- Shared text cleaning moves to `lib/ai/features/text.ts`.

### Surface
- `/morning-brief`: the headline; items with their kind, priority and cards;
  "As of …" and Refresh; Generate on the first visit of the day; every
  refusal and failure as a plain message.
- Dashboard tile: the cached headline when today's brief exists, otherwise
  "What needs you today".
- Server action `generateMorningBrief({ refresh })`, wrapped in
  `loggedAction("ai.morningBrief")`.

### Deferred: the 7am job
Pre-generating at 7am needs a scheduler (hosting, ADR 0005) and a way to run
as a user without a browser session, which belongs with real sign-in. It is
designed here and built with hosting: a job route under `/api/v1/jobs/`,
protected by a secret, that runs the brief for users whose local time is 7am.

Not in scope: email delivery, thumbs up/down (step 7).

## Decisions
- On request now; the 7am job comes with hosting.
- Headline and quiet day computed by code.
- The day's brief is kept with snapshot cards and an "as of" note.
- Same roles as the summary.

## Tests
- Prompt matches ai-prompts.md; version 1.
- Headline: every count, singular and plural, quiet day.
- Limits: at most 6, urgency order, text cut and cleaned.
- With the stand-in: a rep's brief cites only their items, a manager's the
  team's; invented handles dropped; cards per item.
- Day cache: no second call; a changed record keeps the brief with the same
  cards and `changed: true`; Refresh writes a new one; expires at local
  midnight (Sydney and Auckland); per user; hidden when AI is off.
- Peek and the dashboard headline write nothing.
- The summary's facts-mode cache still behaves as before.

## Docs to update
AI layer, AI prompts, data model, server API, features, design system,
testing, roadmap, build log, changelog, CLAUDE.md.

## As built
- Built as planned: `lib/ai/features/morning-brief.ts` (definition,
  `briefHeadline`, `limitBrief`, `briefView`, `morningBriefState`,
  `morningBriefHeadline`), the prompt in `lib/ai/prompts/morning-brief.ts`,
  view types in `lib/ai/brief-view.ts`, shared text cleaning in
  `lib/ai/features/text.ts`, the `generateMorningBrief` action, the
  `/morning-brief` page (`components/ai/morning-brief.tsx`), the dashboard
  tile's headline, and a sample on `/dev/components`.
- **Engine:** cache `mode` (`facts` or `day`); aiOutputs rows keep `cards` and
  `notes`; answers carry `changed`; `latestNotes()` reads a `day` answer's
  notes without facts (only for `day` features, since a `facts` answer needs
  its facts checked).
- **Changed from the plan:** the headline counts follow the brief's own
  urgency order (overdue, visits today, due today, renewals, notifications,
  quiet accounts). A brief with no items still shows the headline; a quiet
  day says so in words.
- **Verified:** 8 integration tests (`ai-brief.test.ts`) and 7 unit tests;
  240 web tests in total; lint, typecheck and build clean. Serving `day`
  briefs like `facts` ones, recomputing the headline on a cached brief, or
  expiring a day late each fails the suite. In the browser: the page says "AI
  isn't set up yet." with Generate off, the dashboard tile falls back to
  "What needs you today", and the sample brief renders with its "As of 7:02
  am" note, badges and per-item cards (checked through the page, as the pane
  wouldn't draw for a screenshot).
- **Not yet verified:** a real answer from OpenAI (key day).
- **Deferred:** the 7am job, with hosting (ADR 0005).
