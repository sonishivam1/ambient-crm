# AI step 5: Wren chat (read-only)

**Status:** Built
**Agreed:** 20 Oct 2026 · **Built:** 20 Oct 2026

## Goal
Users ask Wren questions about their own CRM on `/assistant` ("What's overdue
on ACME?", "Renewals in the next 60 days?") and get a short verified answer
with the records as cards. Wren looks things up with read-only tools that run
as the user; it can't change anything (proposals are step 6). Design:
[AI layer](../architecture/ai.md); prompt: [AI prompts](../architecture/ai-prompts.md).

## Scope

### Tools (`lib/ai/tools/`, `defineAiTool`)
Each runs as the signed-in user on scoped read models and adds its records to
the turn's shared facts builder, so handles never collide across tools.

| Tool | Parameters | Built on |
| --- | --- | --- |
| `list_tasks` | `status`: overdue, due_today, open; `accountName` or null | `getTasksPage()` |
| `get_account` | `name` | account matching + `accountFacts` (step 2) |
| `list_visits` | `range`: past_30_days, this_week, next_14_days; `accountName` or null | call cycle visits, `decorateVisits()` |
| `list_renewals` | `withinDays`: 30, 60, 90 | `getContractsPage()` |
| `find_contacts` | `accountName`, `role`, `query`, each or null | `getContactsPage()`; names, titles and roles only |

- **Account names** are matched only among the user's own accounts (exact
  name first, then contains). None: `ok: false` with "I couldn't find …
  among your accounts". Several: `ok: false` with "Which one: A, B or C?"
- At most 15 records per tool, with the full total; at most **4 tool calls**
  per question (a fifth gets `ok: false`).

### A chat turn (`lib/ai/chat.ts`)
- Access and limits as every feature (`wren-chat`, roles user, manager,
  senior, lead); one question is one request for rate limits and the budget.
- The model gets the policy and chat prompts, the **last 6 turns as plain
  text** (no handles: they mean something only within their own turn), the
  question, and the tools.
- Output: `answer` (text, sources), `bullets` (up to 5, each with sources),
  `followUpQuestion` or null. Verified against the handles the tools returned
  in this turn; invented ones are dropped. When the tools returned records,
  the answer must cite at least one, or the reply is rejected. When no
  records came back (nothing found, a clarifying question, an out-of-scope
  request), the answer is shown without cards and marked "No records were
  used".
- Limits: answer 400 characters, bullets 160 each, the follow-up 200; markup
  and printed handles removed. Tier `fast`, temperature 0.2, at most 800
  output tokens, 30-second limit for the whole turn.
- Logged in `aiInvocations` (metadata only).

### Conversations (`aiConversations`)
- Per user, never shared; a title from the first question; turns embedded:
  the user's text, and Wren's verified answer with the cards it was shown
  with. Kept **90 days** from the last turn (TTL); the user can delete one.
- Survive refresh, navigation and closing the page.

### Route: `POST /api/v1/ai/chat`
- `defineRoute` gains a streaming form: the handler sends events, each checked
  against the route's event schema; the response is newline-delimited JSON.
- Events: `progress` ("Checking your tasks…"), then one `answer`
  (conversation id and the saved turn) or one `error` (reason and message).
  The answer appears only after verification; its text is never streamed.

### Page: `/assistant`
- Conversation list (newest first) with New chat and Delete; the
  conversation; the question box (Enter sends, Shift+Enter for a new line);
  example questions on an empty chat; progress lines while Wren works;
  answers with bullets, cards and the follow-up question as a button. When AI
  isn't available the page says why and the box is off.
- Contact cards may show email and phone (screen data only; facts never hold
  them).
- The Wren side tab keeps linking here; the slide-out panel comes after step 6.

Not in scope: changing data (step 6), thumbs up/down (step 7), the side panel.

## Decisions
- Progress lines, then the verified answer; no streamed answer text.
- Full page first; the side panel after step 6.
- Conversations kept 90 days; the last 6 turns as context.
- Tier `fast`.

## Tests
- Prompt matches ai-prompts.md; tool descriptions are present.
- Tools, as each role: scope (another rep's or tenant's account can't be
  reached by name), name matching and ambiguity, totals, no email, phone or
  id in tool data.
- Turns with the stand-in calling tools: verified answer with cards; invented
  handles dropped; an uncited answer rejected when records came back; an
  uncited "nothing found" accepted and marked; the 4-call cap; refusals before
  any call; one rate-limit count per question.
- Conversations: saved and reloaded; context holds earlier text but no
  handles; another user can't read, continue or delete one; 90-day expiry.
- Route: progress then answer as NDJSON; validation and sign-in errors; the
  versioning guard.

## Docs to update
AI layer, AI prompts, data model, server API, features, design system,
testing, roadmap, build log, changelog, CLAUDE.md.

## As built
- Built as planned: `lib/ai/tools/` (`defineAiTool`, `resolveAccount`, the
  five read tools), `lib/ai/chat.ts` (`runChatTurn`), `lib/ai/conversations.ts`
  on the new `aiConversations` collection, `lib/ai/chat-view.ts` (turn view,
  event and request schemas), the prompt in `lib/ai/prompts/wren-chat.ts`,
  `defineRoute`'s `stream` form and `POST /api/v1/ai/chat`, the
  `deleteWrenConversation` action, and `/assistant`
  (`components/ai/wren-chat.tsx`).
- **Engine and facts:** `accountFacts` now wraps `accountData(scope, input, f)`
  so a tool can add an account to the turn's shared builder; contact cards
  can carry email and phone (screen only); the test stand-in can call tools.
- **Changed from the plan:** "the last 6 turns" is the last 6 questions and
  their answers. A sold-to's contacts are its bill-to's. `list_tasks` and
  `list_visits` on a bill-to include its sold-tos. A tool that throws returns
  `ok: false` to the model (logged), instead of failing the question.
- **Verified:** 6 tool and 11 chat integration tests, 3 unit tests; 260 web
  tests in total; lint, typecheck and build clean. Planted bugs that fail the
  suite: account matching outside the user's scope, uncited answers accepted
  when records came back, earlier turns sent with their handles, no tool-call
  cap. Live: the route streams NDJSON (`X-API-Version: 1`) and answers "AI
  isn't set up yet." without a key; an empty question is a 400; the page
  renders with the box off and no console errors.
- **Found in the browser:** the scroll effect returned `scrollIntoView()`'s
  value, a Promise in current Chromium, which React rejects as a clean-up and
  the page crashed. Fixed by giving the effect a block body. No test covers
  this (there are no component tests yet).
- **Layout, after review:** the first version let the question box float
  mid-page under a fixed-height log. It is now one full-height card: the
  conversation list in its own scrolling panel, the messages scrolling, the
  box pinned to the bottom; stacked on phones. Questions use the raised
  surface in dark mode (navy disappeared there). Suggested questions sit as
  coral pills above a single-line pill field with a separate Ask button; the
  first names the user's largest account (`chatSuggestions`, scoped), e.g.
  "Summarise Harrow Hardware Group". On phones they scroll in one row. A sample conversation on
  `/dev/components` shows the filled-in chat without a key.
- **Lesson:** the first two mutation checks passed: the account read behind
  `get_account` is scoped too, which masked an unscoped name match (an
  "ambiguous" question could have listed another rep's accounts); a test now
  checks the match itself. A mutation that doesn't change behaviour proves
  nothing: check it applies.
- **Not yet verified:** real answers and tool choice from OpenAI (key day).
