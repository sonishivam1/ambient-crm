# Server API

Ambient has no separate REST API for its own UI. Pages read through server-only
read models, and mutations are **server actions**. Route handlers exist only for
callers outside the web app.

## Read models (built)

| Function | File | Returns |
| --- | --- | --- |
| `getCurrentUser()` | `lib/auth/session.ts` | the signed-in user with role capabilities; marks the render request-time |
| `getRepScope(user)` | `lib/auth/visibility.ts` | `{ all: true }` or the rep ids the user can see |
| `getScope()` | `lib/data/scope.ts` | user and tenant, rep scope, lens; the tenant's `timeZone`, `today` (local midnight) and visible `divisions` with `divisionLabel(key)`; `tenant()` and `filter(ownerField?)` for queries |
| `getDashboard()` | `lib/data/dashboard.ts` | everything the dashboard renders, already scoped |
| `getAccountsPage(query)` | `lib/data/accounts.ts` | one page of groups or accounts with summary and page count, from validated URL params |
| `getChildAccounts(parent)` | `lib/data/accounts.ts` | bill-tos of a group or sold-tos of a bill-to, scoped |
| `getTodayTasks()` | `lib/data/tasks.ts` | open tasks overdue and due today, in scope |
| `getTasksPage(query)` | `lib/data/tasks.ts` | one page of tasks from validated URL filters, with total and page count |
| `getTaskOptions()` | `lib/data/tasks.ts` | filter options and who the user may assign to |
| `getGroupProfile(id)` | `lib/data/group-profile.ts` | the group page (group, bill-tos with sold-to counts, health mix, task counts, recent activity), or `null` when outside scope |
| `getAccountProfile(id)` | `lib/data/account-profile.ts` | the profile (account, group, related accounts, tasks, next visit, timeline, active contacts), or `null` when outside scope |
| `getCallCycle(query)` | `lib/data/visits.ts` | six weeks of visits from this Monday (tenant calendar), four weeks of history, older planned visits needing closing, rep options and who the user may book |
| `getNotifications(query)` | `lib/data/notifications.ts` | the user's own notifications grouped by tenant day, with unread count, types present and page count; account links only when in scope |
| `getContractsPage(query)` | `lib/data/contracts.ts` | one page of contracts (search, band, account, sort) with days left and band per row, and a count per band |
| `getAccountContracts(scope, billToId)` | `lib/data/contracts.ts` | a bill-to's current contracts for the profile card |
| `getContactsPage(query)` | `lib/data/contacts.ts` | one page of contacts from validated URL filters (search, role, account, status), sorted by last name, with total and page count |
| `getContactOptions()` | `lib/data/contacts.ts` | accounts that have contacts in scope, the tenant's contact roles, the time zone |
| `getAccountContacts(scope, account)` | `lib/data/contacts.ts` | active contacts for a profile: a bill-to's, or a sold-to's site plus its bill-to's account-wide ones |

## Server actions (built)

| Action | File | Input | Effect | Audit |
| --- | --- | --- | --- | --- |
| `createTask(input)` | `app/actions/tasks.ts` | bill-to account, title, due date (today or later), priority, description, notes, assignees | one task per assignee (managers) or for yourself; notifies other assignees | `task.create` |
| `updateTask(input)` | `app/actions/tasks.ts` | task id, fields, status, owner (managers) | edits a task in scope; a changed due date can't be in the past | `task.update` (changed fields; text fields only flagged as changed) |
| `cancelTask(input)` | `app/actions/tasks.ts` | task id, optional reason (300 chars) | cancels a task in scope | `task.cancel` |
| `completeTask(id)` | `app/actions/tasks.ts` | task id | marks a task in scope complete, in a transaction | `task.complete` |
| `createContact(input)` | `app/actions/contacts.ts` | bill-to, optional sold-to under it, first and last name, job title, email, phone, roles | adds a contact on a bill-to in scope; copies its owner and division; refuses a duplicate email in the tenant and roles the tenant doesn't have | `contact.create` (account, site, roles, whether email/phone are set; never name, email or phone) |
| `updateContact(input)` | `app/actions/contacts.ts` | contact id and the same fields | edits a contact in scope, including moving it to another bill-to in scope | `contact.update` (account, site and role changes; personal fields only named as changed) |
| `setContactActive(input)` | `app/actions/contacts.ts` | contact id, `active` | deactivates or reactivates a contact in scope | `contact.deactivate` / `contact.reactivate` |
| `createVisit(input)` | `app/actions/visits.ts` | bill-to, date (today or later), time, type, purpose, rep (managers) | plans a visit in scope at the tenant's local time; notifies a rep someone else booked | `visit.create` |
| `updateVisit(input)` | `app/actions/visits.ts` | visit id, date, time, type, purpose, rep (managers) | reschedules or edits a planned visit in scope; a moved visit can't go into the past | `visit.reschedule` / `visit.update` (changed fields) |
| `cancelVisit(input)` | `app/actions/visits.ts` | visit id, optional reason (300 chars) | cancels a planned visit in scope | `visit.cancel` |
| `completeVisit(input)` | `app/actions/visits.ts` | visit id, sentiment, three 1–5 ratings, key points, follow-ups | completes a visit on or after its day with its report, or adds the report to a completed one | `visit.complete` / `visit.report` (scores only; text flagged, never copied) |
| `markNotificationRead(id)` | `app/actions/notifications.ts` | notification id | marks one of your own notifications read (keeps the first read time); `false` if it isn't yours | — (read state, not business data) |
| `markAllNotificationsRead()` | `app/actions/notifications.ts` | — | marks all your unread notifications read; returns how many | — |
| `searchBillToAccounts(q)` | `app/actions/accounts.ts` | up to 100 chars | up to 8 bill-to accounts in scope for the task and contact dialogs | — (read) |
| `listSoldTos(billToId)` | `app/actions/accounts.ts` | bill-to id | its sold-to sites, empty when the bill-to isn't in scope | — (read) |
| `paletteSearch(q)` | `app/actions/search.ts` | 2–100 chars | up to 8 accounts in scope matching name or code, and up to 5 active contacts matching name or email | — (read) |
| `logInteraction(input)` | `app/actions/interactions.ts` | account id, type, summary (1–4,000 chars) | logs a note, call or meeting on an account in scope, in a transaction | `interaction.log` (type and account only, never the text) |
| `loadChildAccounts(parent)` | `app/actions/accounts.ts` | `{ kind, id }`, kind `group` or `billTo` | child rows for an expanded accounts row, in scope | — (read) |
| `setLens(lens)` | `app/actions/session.ts` | `all` or one of the tenant's lens keys | sets the lens cookie (senior roles only); another tenant's lens is refused | — |
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
