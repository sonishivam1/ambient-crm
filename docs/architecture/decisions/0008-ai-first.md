# 0008: AI-first: one action layer, and Wren can do what the user can

**Status:** Accepted (23 Oct 2026), with the
[AI-first plan](../../plans/ai-first-plan.md) frozen. Changes guarantee 2 of
the [AI layer](../ai.md#four-guarantees) and the "deliberately not built" list
there; [ADR 0006](0006-ai-provider.md) (OpenAI through the AI SDK, one engine)
stands.

## Context

Today Wren has eight tools: five that read (tasks, an account, visits,
renewals, contacts) and three that propose a task, a visit or a note. Every
other job still means going to a page and filling in a form. The product
direction is that a person can do **everything** by asking: Wren finds,
explains, changes and prepares, across every area of the CRM and the systems
connected to it, the way a coding assistant works through chat rather than
clicks.

That needs three things the current design doesn't have: every capability
reachable by the AI (not a hand-written tool per feature), a confirmation rule
that doesn't put a click in front of every small change, and a safe way to
reach outside systems.

## Decision

1. **One action layer.** Every read and every change in Ambient is an
   *action* (`defineAction`): typed input, a permission check, a risk level,
   an audit row and a preview sentence. The page forms and Wren call the
   **same** action; Wren's tools are generated from the action registry. A new
   feature is an action first, so Wren can use it the day it ships. There is
   no AI-only write path.
2. **Wren can do what the user can, and nothing more.** Tools run as the
   signed-in user through `getScope()`; an action Wren calls passes exactly
   the checks it would from the form.
3. **Risk levels decide confirmation**, set by code, never by the model:
   - *read*: runs;
   - *low* (a change to your own work, e.g. your own task or note): runs and
     shows **Undo**;
   - *medium* (anything touching someone else's work, a reschedule, an edit to
     a shared record): a confirm card, one tap;
   - *high* (bulk changes, contracts, anything sent outside Ambient): a full
     preview and an explicit confirm, one at a time;
   - *never by AI*: roles, users, access, settings and the AI policy.

   A tenant can raise any action's level (never lower it below the built-in
   floor), and a user can choose "always ask me".
4. **Untrusted text can't trigger a change.** If a turn has read text written
   by a customer or a connector (notes, email, documents), every change in
   that turn needs a confirm, whatever its level. Likewise a note, report or
   message body Wren composed is always previewed, and a request that changes
   more than 3 records becomes one review card.
5. **Confirms are bound and writes are safe to retry.** A confirm is tied to
   one proposal (the action, the validated input, the user, the tenant),
   expires, and is checked again when it runs; typing "yes" never confirms.
   Every action call has an idempotency key, and every write carries the
   version it was previewed against, so retries don't duplicate and stale
   previews don't overwrite.
6. **Pages stay as an optional view.** Chat-first, not chat-only: Wren shows
   records as tables, calendars, charts and prefilled forms inside the
   conversation (rendered from records, never from model text), with a link
   to the full page.
7. **Connectors** reach outside systems (Microsoft 365, the ERP, BI, later
   approved MCP servers) as more actions with their own risk levels; their
   content is always untrusted. Sending a message to a customer becomes
   possible, but only as a *high* action: one message, previewed, sent from
   the user's own mailbox on an explicit confirm, never by a background job.
8. **Background work never writes.** Scheduled or triggered runs (the 7am
   brief, renewal checks, after-visit follow-ups) read and prepare; every
   change they suggest waits in the user's Wren inbox for approval.

9. **The actions and the policy are the platform.** Pages, Wren, jobs,
   connectors and later Ambient's own API and MCP server are all clients of
   the same registry. One Wren agent with tool routing, on the AI SDK; no
   agent framework now (OpenAI's Agents SDK is an option to revisit if
   handoffs or managed tracing are ever needed).

## Consequences

- The AI layer's guarantee 2 changes from "nothing changes without the user's
  Confirm" to "nothing changes unless the user asked for it: low-risk changes
  can be undone, everything else waits for the user's confirm, and background
  work never writes". The other guarantees are unchanged.
- Every existing server action moves onto the action layer before Wren gets
  new tools (phase A of the plan), gaining an idempotency key, a version check
  and the fuller audit metadata (`via`, request id, outcome). The forms keep working unchanged; guard
  tests fail any write that bypasses the registry.
- Undo needs the state before each AI change (`aiActions`), kept for 24 hours
  and honoured only while the record is unchanged since.
- Dozens of tools can't all be sent to the model: tools are grouped and loaded
  on demand, and multi-step requests run as a bounded plan (a step and time
  cap, a Stop button).
- Quality matters more as Wren gains write power: every action group gets
  evaluation cases (including injection attempts that try to cause a write),
  and the gate runs on the real model before each release. Development starts
  after key day.
- Multi-step work may use the strong model tier, so cost per question rises;
  tenant token budgets and per-user rate limits still bound it.
- Connector tokens are stored encrypted per tenant and user, which depends on
  the hosting decision ([ADR 0005](0005-hosting-and-sign-in.md)).
