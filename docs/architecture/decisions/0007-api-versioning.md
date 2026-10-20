# 0007: HTTP APIs are versioned under /api/v1

**Status:** Accepted (20 Oct 2026)

## Context

Ambient's own pages read through server components and write through server
actions. Those are not a public API: they ship in the same deployment as the
page that calls them, so they need no versioning.

HTTP route handlers arrive with Wren chat (AI step 5), the Outlook add-in, the
Microsoft Graph webhooks and the health check, and later with integrations
for customers' own systems. Some of those callers (an installed add-in, a
webhook subscription, a customer's integration) are not redeployed with
Ambient, so a change to a route can break them silently.

## Decision

| Rule | Detail |
| --- | --- |
| **Every route handler lives under `/api/v1/…`** | `app/api/v1/<area>/<name>/route.ts`, e.g. `/api/v1/ai/chat`, `/api/v1/addin/messages`, `/api/v1/webhooks/graph`. No exceptions, even for routes only our UI calls, so there is one rule to remember |
| **Within a version, changes are additive only** | New endpoints, new optional request fields and new response fields are fine. Renaming, removing, changing a field's type or meaning, or tightening validation is a breaking change |
| **Breaking changes get a new version** | `/api/v2/…` alongside v1. v1 keeps working for a stated period and its responses carry `Deprecation` and `Sunset` headers and a `Link` to its successor |
| **Contracts are Zod schemas** | Each route's request and response schemas live next to it (`schema.ts`); they validate requests and can generate OpenAPI documentation later |
| **One error shape** | `{ "error": { "code": "not_found", "message": "…" } }` with the matching status (400 invalid input, 401 not signed in, 404 not found or not visible, 429 rate limited, 500 anything else). Never internal details or provider messages |
| **Same rules as server actions** | Parse input with Zod, `getScope()`, scope re-check, audit row for writes; out of scope is 404, never 403 |
| **`GET /api/health` stays unversioned** | Hosting platforms expect a fixed path; it returns no data |

## Enforcement (built)

- `defineRoute()` in `apps/web/lib/api/route.ts` is the only way to write a
  route handler; it applies every rule above (version header, Zod input and
  output, sign-in, error shape, request id, deprecation headers, logging).
- A guard test (`apps/web/tests/unit/guards.test.ts`) fails if a `route.ts`
  lives outside `app/api/v1/…` (other than `app/api/health`) or doesn't use
  `defineRoute`.
- First routes: `GET /api/health` and `GET /api/v1/me`; then
  `POST /api/v1/ai/chat` (AI step 5), the first streaming route
  (`defineRoute` with `stream`, NDJSON events checked against a schema).

## Consequences

- Moving a route to v2 means keeping v1's handler (often a thin adapter onto
  the new code) until its sunset date.
- Our own UI and Wren always call the latest version; the version mainly
  protects callers we don't deploy.
- Server actions stay unversioned. If one ever needs to be called by something
  other than our pages, it gets a versioned route instead.
