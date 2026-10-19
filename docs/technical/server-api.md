# Server API

Ambient has no separate REST API for its own UI. Pages read through server-only
read models, and mutations are **server actions**. Route handlers exist only for
callers outside the web app.

## Read models (built)

| Function | File | Returns |
| --- | --- | --- |
| `getCurrentUser()` | `lib/auth/session.ts` | the signed-in user with role capabilities; marks the render request-time |
| `getRepScope(user)` | `lib/auth/visibility.ts` | `{ all: true }` or the rep ids the user can see |
| `getScope()` | `lib/data/scope.ts` | user and tenant, rep scope, lens; `tenant()` and `filter(ownerField?)` for queries |
| `getDashboard()` | `lib/data/dashboard.ts` | everything the dashboard renders, already scoped |
| `getAccountsPage(query)` | `lib/data/accounts.ts` | one page of groups or accounts with summary and page count, from validated URL params |
| `getChildAccounts(parent)` | `lib/data/accounts.ts` | bill-tos of a group or sold-tos of a bill-to, scoped |
| `getTodayTasks()` | `lib/data/tasks.ts` | open tasks overdue and due today, in scope |
| `getTasksPage(query)` | `lib/data/tasks.ts` | one page of tasks from validated URL filters, with total and page count |
| `getTaskOptions()` | `lib/data/tasks.ts` | filter options and who the user may assign to |
| `getAccountProfile(id)` | `lib/data/account-profile.ts` | the profile (account, group, related accounts, tasks, next visit, timeline), or `null` when outside scope |

## Server actions (built)

| Action | File | Input | Effect | Audit |
| --- | --- | --- | --- | --- |
| `createTask(input)` | `app/actions/tasks.ts` | bill-to account, title, due date (today or later), priority, description, notes, assignees | one task per assignee (managers) or for yourself; notifies other assignees | `task.create` |
| `updateTask(input)` | `app/actions/tasks.ts` | task id, fields, status, owner (managers) | edits a task in scope; a changed due date can't be in the past | `task.update` (changed fields; text fields only flagged as changed) |
| `cancelTask(input)` | `app/actions/tasks.ts` | task id, optional reason (300 chars) | cancels a task in scope | `task.cancel` |
| `completeTask(id)` | `app/actions/tasks.ts` | task id | marks a task in scope complete, in a transaction | `task.complete` |
| `searchTaskAccounts(q)` | `app/actions/tasks.ts` | up to 100 chars | up to 8 bill-to accounts in scope for the task dialog | — (read) |
| `paletteSearch(q)` | `app/actions/search.ts` | 2–100 chars | up to 8 accounts in scope matching name or code | — (read) |
| `logInteraction(input)` | `app/actions/interactions.ts` | account id, type, summary (1–4,000 chars) | logs a note, call or meeting on an account in scope, in a transaction | `interaction.log` (type and account only, never the text) |
| `loadChildAccounts(parent)` | `app/actions/accounts.ts` | `{ kind, id }`, kind `group` or `billTo` | child rows for an expanded accounts row, in scope | — (read) |
| `setLens(lens)` | `app/actions/session.ts` | `both` \| `wholesale` \| `uniforms` | sets the lens cookie (senior roles only) | — |
| `switchDevUser(id)` | `app/actions/session.ts` | seeded user id | development only: switch signed-in user | — |

Every action parses its input with Zod and checks scope itself: server actions
are reachable over HTTP by anyone who can reach the app.

## Route handlers (planned)

| Route | Caller | Auth |
| --- | --- | --- |
| `POST /api/chat` | Wren (streaming) | web session |
| `POST /api/addin/messages`, `POST /api/addin/meetings` | Outlook add-in | Office SSO bearer token |
| `POST /api/webhooks/graph` | Microsoft Graph change notifications (optional, alongside polling) | Graph validation token + client state |
| `GET /api/health` | Hosting health check | none; returns no data |

## Errors

- Not in scope → "Not found" (never "forbidden", so existence isn't leaked).
- Invalid input → Zod error message, no partial write.
- Anything else → generic message to the user; details to server logs.
