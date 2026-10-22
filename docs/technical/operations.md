# Operations

How Ambient is watched and what to do when something goes wrong. Most of this
is **planned** and lands with deployment and the background workers.

## Logs

Everything logs through `@ambient/logger` (pino): JSON lines on stdout in
production, readable lines in development, silent in tests. Every line has
`time`, `level`, `service`, `area` and, where known, `requestId`, `tenantId` and
`userId`. Secrets, connection strings, emails and phone numbers are masked and
free-text fields are removed inside the logger, so logs are safe to ship to the
host's log service (with hosting, Phase 0). `LOG_LEVEL` sets the minimum level.

| What is logged | Where | Fields |
| --- | --- | --- |
| Every server action | `loggedAction` | `action`, `outcome`, `reason` (for `rejected`), `ms` |
| Every API request | `defineRoute` | `route`, `method`, `path`, `status`, `code`, `ms` |
| Every unhandled server error | `instrumentation.ts` (`onRequestError`) | `route`, `routeType`, `method`, `path` (no query), `digest`, `err` (name and code) |
| Sign-in problems | `lib/auth/session.ts` | `reason`, `requestedUserId` |
| Failed AI calls | the AI engine | `feature`, `model`, `errorKind`, `attempts` |

**Tracing one request:** every page, server action and API call gets an
`x-request-id` (from `proxy.ts`), returned on the response and present on every
log line for that request. Search the logs for it.

## What we watch

| Signal | Source | Alert when |
| --- | --- | --- |
| Web errors and latency | Host logs and metrics | error rate or p95 latency above threshold |
| Capture liveness | Mailbox and calendar cursors (`lastSuccessAt`) | a mailbox has not advanced for 30 minutes |
| Sync health | `syncRuns` (one row per dataset per run) | any dataset `failed` or `aborted` |
| AI cost and errors | `aiInvocations` | tenant over daily budget; error rate spike |
| Database | Atlas metrics | storage, connections or slow queries over threshold |

## Backups

Atlas cloud backups with point-in-time restore on staging and production
clusters. A restore is rehearsed before launch and then quarterly.

## AI quality

- **Before shipping a prompt or model change:** `pnpm ai:eval` (needs
  `OPENAI_API_KEY` and `OPENAI_MODEL` in the shell; it uses a throwaway test
  database), then `pnpm ai:eval:compare`. A lower score than
  `apps/web/evals/baseline.json` means it doesn't ship. After a deliberate
  improvement, `pnpm ai:eval:baseline` and commit the new baseline.
- **Choosing a model:** run `pnpm ai:eval` once per model
  (`OPENAI_MODEL=… pnpm ai:eval`) and compare scores and cost per answer.
- **In production:** `/admin/ai` (admins) shows this month's requests,
  failures, refusals, tokens, estimated cost (set `OPENAI_PRICE_INPUT_PER_M`
  and `OPENAI_PRICE_OUTPUT_PER_M`) and 👍 share per prompt version. A drop in
  👍 after a prompt change is a reason to roll it back.

## Runbooks

### A credential was exposed
1. Rotate it at the source (Atlas → Database Access, provider console, Entra app).
2. Update the value in every environment's settings and local `.env` files.
3. Check access logs for use of the old value.
4. If it was committed, rotate first, then remove it from history.

### Reset demo data
```bash
pnpm --filter @ambient/db seed --allow-remote --reset
```
Drops every collection in `MONGODB_DB` and reseeds. Never run against a
database holding customer data.

### Sync aborted
1. Open sync health; find the dataset and the guard that tripped.
2. Compare source row counts with the last good run.
3. If the source export is broken, leave the abort in place and contact the
   customer's data team; the mirror keeps the last good data.
4. If the change is genuine, re-run with the guard override for that dataset.

### Capture stopped for a mailbox
1. Check the mailbox cursor's last error.
2. Common causes: consent revoked, mailbox moved out of the access policy,
   Graph throttling. Fix the cause; the cursor resumes from where it stopped.
