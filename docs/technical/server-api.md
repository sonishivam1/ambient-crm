# Server API

Ambient has no separate REST API for its own UI. Pages read through server-only
read models, and mutations are **server actions**. Route handlers exist only for
callers outside the web app.

## Read models (built)

| Function | File | Returns |
| --- | --- | --- |
| `getCurrentUser()` | `lib/auth/session.ts` | the signed-in user with role capabilities; marks the render request-time |
| `getRepScope(user)` | `lib/auth/visibility.ts` | `{ all: true }` or the rep ids the user can see |
| `getScope()` | `lib/data/scope.ts` | user, rep scope, lens, and `filter(ownerField?)` for queries |
| `getDashboard()` | `lib/data/dashboard.ts` | everything the dashboard renders, already scoped |

## Server actions (built)

| Action | File | Input | Effect | Audit |
| --- | --- | --- | --- | --- |
| `completeTask(id)` | `app/actions/tasks.ts` | task id | marks a task in scope complete, in a transaction | `task.complete` |
| `paletteSearch(q)` | `app/actions/search.ts` | 2–100 chars | up to 8 accounts in scope matching name or code | — (read) |
| `setLens(lens)` | `app/actions/session.ts` | `both` \| `wholesale` \| `uniforms` | sets the lens cookie (senior roles only) | — |
| `switchDevUser(id)` | `app/actions/session.ts` | seeded user id | development only: switch signed-in user | — |

Every action parses its input with Zod and checks scope itself: server actions
are reachable over HTTP by anyone who can reach the app.

## Route handlers (planned)

| Route | Caller | Auth |
| --- | --- | --- |
| `POST /api/chat` | Cara (streaming) | web session |
| `POST /api/addin/messages`, `POST /api/addin/meetings` | Outlook add-in | Office SSO bearer token |
| `POST /api/webhooks/graph` | Microsoft Graph change notifications (optional, alongside polling) | Graph validation token + client state |
| `GET /api/health` | Hosting health check | none; returns no data |

## Errors

- Not in scope → "Not found" (never "forbidden", so existence isn't leaked).
- Invalid input → Zod error message, no partial write.
- Anything else → generic message to the user; details to server logs.
