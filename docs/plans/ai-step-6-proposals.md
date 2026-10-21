# AI step 6: proposals, follow-up suggestions and the side panel

**Status:** Built
**Agreed:** 21 Oct 2026 · **Built:** 21 Oct 2026

## Goal
Wren can prepare a task, a visit or a note for the user to accept, and
suggest follow-up tasks after a visit report. Nothing changes until the user
clicks Accept, which runs the same code as the normal form, so every rule
(scope, dates, assignment rights, audit) applies unchanged. Wren also opens
as a side panel on any page. Design: [AI layer](../architecture/ai.md);
prompts: [AI prompts](../architecture/ai-prompts.md).

## Scope

### Proposals (`aiProposals`)
- One row per proposal: the user's own, its kind (`task`, `visit`, `note`),
  the exact input the form would send, what the card shows, its status
  (`pending`, `accepted`, `dismissed`), what it created, where it came from
  (`chat` or `followups`), and an expiry **7 days** out (TTL).
- **Single use:** Accept moves `pending` to `accepted` in one atomic step
  before anything is written, so a double click can't create two records;
  the second click gets the first result. An expired or dismissed proposal
  can't be accepted.
- **Accept** runs the same code as the form: tasks through the shared task
  writer behind `createTask` (marked as from Wren, source `ai`, created by the
  user), visits through `createVisit`, notes through `logInteraction`. If the
  action refuses (for example the date has passed since), the proposal goes
  back to `pending` and the card shows why.
- **Edit** opens the existing task, visit or note form with the proposal's
  values; saving there marks the proposal accepted.
- **Dismiss** marks it dismissed; nothing is written.

### Propose tools (chat)
| Tool | Parameters | Refuses (with the question to ask) |
| --- | --- | --- |
| `propose_task` | `accountName`, `title`, `dueDate` (YYYY-MM-DD), `priority` | an account not among the user's, a generic title ("Follow up", "Call"), a missing or past due date |
| `propose_visit` | `accountName`, `date`, `time` or null, `type`, `purpose` or null | an account not among the user's, a missing or past date |
| `propose_note` | `accountName`, `type` (note, call, meeting), `summary` | an account not among the user's, an empty summary |

- A propose tool writes only the proposal, never the record. At most 3 per
  question. Proposals are for the user only (no assigning to others).
- Each answer shows its proposals as cards under the text, with their live
  status when the conversation is reopened.

### Follow-up suggestions (`followup-suggestions` v1)
- After a post-visit report is saved, the visit offers **Suggest
  follow-ups** (on request).
- Facts: the visit (date, purpose, the report's key points and follow-ups,
  fenced) and the account's open tasks. Output: up to 3 tasks, each with a
  title in the report's words, days until due (0 to 30, default 7), a
  priority, a reason and sources. Only explicit commitments; nothing already
  covered by an open task.
- Each suggestion becomes a task proposal card (Accept, Edit, Dismiss).

### Side panel
- The Wren tab opens a slide-out panel on any page (except `/assistant`)
  with the same chat: the same conversations, so a chat started in the panel
  continues on the full page.
- On a customer profile, the panel's suggestions are about that account
  ("Summarise Acme Safety", "What's overdue on Acme Safety?").
- Closes with Escape or the close button; focus moves in and back.

Not in scope: assigning proposals to other people, editing proposals on the
card, thumbs up/down (step 7).

## Decisions
- Edit opens the existing form, filled in.
- Follow-ups on request after a visit report.
- The side panel shares conversations and knows the page.
- Proposals expire after 7 days and work once.

## Tests
- Propose tools: each refusal; a valid proposal is stored, nothing else is
  written; another rep's account can't be proposed on.
- Accept: creates through the real action with its rules (a past date
  refused at Accept time and the proposal stays pending); a task is marked
  from Wren; double Accept creates one record; another user's, dismissed or
  expired proposal can't be accepted; the audit row is written.
- Chat: a turn with propose calls returns proposal cards; reopening shows
  their status; the cap of 3.
- Follow-ups: verified suggestions become proposals; invented handles and
  ones covered by open tasks dropped (by the model, and by verification for
  handles); only for the user's own completed visits with a report.
- Prompts match ai-prompts.md.

## Docs to update
AI layer, AI prompts, data model, server API, features, design system,
testing, roadmap, build log, changelog, CLAUDE.md.

## As built
- Built as planned: `aiProposals`; `lib/ai/proposals.ts` (create, views,
  atomic Accept, Dismiss, saved-from-the-form); the propose tools in
  `lib/ai/tools/propose.ts`; chat prompt v2 and answers carrying their
  proposals (`proposalIds` on turns, live status when reopened);
  `followup-suggestions` (`lib/ai/features/followup-suggestions.ts`, facts in
  `lib/ai/facts/visit.ts`); the proposal card (`components/ai/proposal-card.tsx`),
  the Follow-ups button on visits (`components/ai/follow-ups.tsx`), and the side
  panel (`components/shell/assistant-tab.tsx`, data from `lib/ai/panel.ts`).
- **Same code as the form:** `createTask`'s rules moved to
  `lib/writes/tasks.ts` (`createTasks`), which both the form action and Accept
  call; Accept calls `createVisit` and `logInteraction` themselves. The task,
  visit and note dialogs gained `draft` and `onSaved` for Edit;
  `InteractionDialog` was split out of `LogInteractionButton`.
- **Changed from the plan:** the follow-up output has no `none` flag (an empty
  list says it); generic titles are dropped by code too. Follow-ups only offer
  on the user's own visits, since the task is theirs. The panel continues the
  latest conversation if it was active in the last 24 hours. A proposal's
  "accepting" state is shown as pending to other tabs.
- **Verified:** 10 integration tests (`ai-proposals.test.ts`) and 4 unit
  tests; 275 web tests in total; lint, typecheck and build clean. Planted bugs
  that fail the suite: no atomic claim on Accept, the Wren mark dropped, no
  follow-up dedupe, follow-ups on visits that aren't the user's. In the
  browser: the proposal card, Edit opening the task form filled in, and the
  side panel on a customer profile (account-aware suggestions, focus in and
  back, Escape closes) with no console errors.
- **Not yet verified:** real proposals and follow-ups from OpenAI (key day);
  the Follow-ups button on screen (the dev user has no own completed visits
  with a report; tests cover when it shows).
