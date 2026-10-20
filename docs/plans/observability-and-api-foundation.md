# Observability and API foundation

**Status:** Built
**Agreed:** 20 Oct 2026 · **Built:** 20 Oct 2026

## Goal
Make logging and API versioning app-wide, not just rules on paper. Today the
logger is wired only into the AI engine and scripts, and nothing enforces
[ADR 0007](../architecture/decisions/0007-api-versioning.md). After this step
every request has an id, every server error and server action is logged with
context, and the only way to add an HTTP route is a versioned one.

## Scope

### Logging across the app

| # | Piece | What it does |
| --- | --- | --- |
| 1 | `proxy.ts` (Next 16 middleware) | Every request gets an `x-request-id` (the caller's if well-formed, otherwise a new UUID), on the request and the response |
| 2 | `lib/log.ts`: `requestLogger(area)` | A logger already carrying the request id, tenant and user |
| 3 | `instrumentation.ts`: `onRequestError` | Next's hook for every unhandled server error (pages, server actions, routes, proxy), logged once with route, type, request id; codes only, query strings dropped |
| 4 | `loggedAction(name, fn)` on every server action | Logs each action's name, duration and outcome (`ok`, `rejected` with its reason, or `error`), then returns or rethrows unchanged |
| 5 | Sign-in | Warnings for an unknown dev user (fallback used) and refused sign-in |
| 6 | Guard test | Fails if `console` is used in app, lib, components or package source (except `db:inspect`'s report) |

### API versioning, enforced

| # | Piece | What it does |
| --- | --- | --- |
| 1 | `lib/api/route.ts`: `defineRoute()` | The only way to write a route handler: version, Zod input and output, sign-in via `getScope()`, one error shape, request id echoed, `X-API-Version`, optional `Deprecation` / `Sunset` / `Link`, one log line per request |
| 2 | `GET /api/health` | The one unversioned route; no data |
| 3 | `GET /api/v1/me` | First v1 route: the signed-in user's name, email and role, and the tenant's name and time zone |
| 4 | Guard test | Fails if a `route.ts` lives outside `app/api/v1/…` (other than `app/api/health`), or doesn't use `defineRoute` |

Not in scope: browser-side error reporting (needs its own route; comes with
hosting), shipping logs to a hosted service (Phase 0).

## Decisions
- Action names are `<area>.<verb>` (`tasks.create`, `visits.complete`).
- Actions log at `info` (they're the app's operations); failures at `error`.
  Expected refusals (`{ ok: false }`) are `rejected`, not errors.
- Errors thrown by Next for control flow (redirects, not found) are rethrown
  without being logged as failures.
- `defineRoute` errors: 400 `invalid_input` / `invalid_json`, 401
  `unauthenticated`, 404 `not_found`, 429 `rate_limited`, 500 `internal`.
  Handlers raise expected ones with `ApiError(status, code, message)`;
  anything else is a 500 with a generic message, logged with a code only.
- The response is checked against its output schema; a mismatch is a 500, so a
  route can't leak fields it didn't declare.

## Tests
- `loggedAction`: logs name, outcome and duration with tenant and user; keeps
  results; rethrows errors and logs them as `error`.
- `onRequestError`: logs route, type and request id; never the error's
  message; drops the query string.
- `defineRoute`: success shape and headers; 400 for bad input and bad JSON;
  401 when sign-in is off; `ApiError` statuses; a crash is a generic 500 that
  doesn't leak its message; output that doesn't match is a 500; request id
  echoed or generated; deprecation headers.
- `/api/health` and `/api/v1/me` (scoped to the signed-in user, right tenant).
- Guards: no `console`; every route versioned and on `defineRoute`; every
  server action wrapped.

## Docs to update
ADR 0007 (enforcement), server API, conventions, operations, testing,
CLAUDE.md, build log, roadmap, README.

## As built
- Built as planned: `proxy.ts`, `lib/request-id.ts`, `lib/log.ts`
  (`requestContext`, `requestLogger`, `loggedAction`), `lib/request-error.ts`
  with `instrumentation.ts`, all 20 server actions wrapped, sign-in warnings,
  `lib/api/route.ts` (`defineRoute`, `ApiError`), `GET /api/health`,
  `GET /api/v1/me`, and the guard tests.
- **Changed from the plan:** sign-in failures now throw
  `AppError("unauthenticated", …)` so `defineRoute` can tell "not signed in"
  (401) from a database failure (500). Each route's schemas live in a
  `schema.ts` beside it, because `route.ts` may only export HTTP methods.
- **Verified:** 6 unit (guards, request ids, proxy) and 15 integration tests
  (observability, API); 24 db, 9 logger and 186 web tests in total; lint,
  typecheck and build clean. Each guard fails when a violation is added. Live
  on the dev server: `/api/health` and `/api/v1/me` answer with request ids and
  `X-API-Version`, and the server log shows API requests and a real server
  action (`search.palette`) with request id, tenant, user, outcome and
  duration.
- **Lessons:** Next only checks that a `"use server"` export is a function, so
  wrapped actions (`export const x = loggedAction(…)`) are fine.
  `requestLogger` can't be used inside sign-in itself (it reads the signed-in
  user), so `session.ts` uses `createLogger` directly.
