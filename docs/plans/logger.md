# Logger

**Status:** Built
**Agreed:** 20 Oct 2026 · **Built:** 20 Oct 2026

## Goal
One structured logger for the whole product, so production logs are useful
(searchable JSON with context on every line) and can never leak secrets or
customer data. Today there are a dozen bare `console` calls; the sync and
capture workers and the AI routes will need much more.

## Scope

A workspace package, **`@ambient/logger`**, on **pino**:

| Capability | Detail |
| --- | --- |
| Output | JSON lines in production; readable single lines in development and tests |
| Levels | `trace` … `fatal`; `LOG_LEVEL` sets the minimum (default `info`; `silent` in tests) |
| Context | Child loggers carry `area` (`ai`, `actions`, `seed`, …) and request context: `requestId`, `tenantId`, `userId` |
| Redaction | Keys, tokens, passwords, secrets, connection strings, cookies and `authorization` headers are masked; email addresses and phone numbers are masked; free-text fields (prompt, reply, facts, note, summary, description, body, key points, follow-ups) are removed |
| Errors | Logged as `{ err: { name, code } }`; message and stack only for our own errors, never a provider's message, which can echo request data |
| One logger everywhere | Server code, the AI engine, the db scripts, later the workers |

Not in scope: shipping logs to a hosted service (comes with hosting, Phase 0);
request ids from middleware (comes with the first route handler).

## Decisions
- **pino** (fast, JSON-first, built-in redaction), at an exact version at
  least two weeks old.
- **Redaction lives in the package**, not at call sites, so a careless log
  line still can't leak.
- The AI usage log (`aiInvocations`) stays separate: it is data in MongoDB,
  not log output.

## Tests
- Every sensitive key is masked or removed at any depth.
- A connection string, a bearer token and an email address inside a message
  string are masked.
- Child context appears on every line; levels filter.
- Errors keep name and code, drop provider messages.

## Docs to update
Configuration (`LOG_LEVEL`), conventions (how to log), operations, CLAUDE.md,
build log.

## As built
- `packages/logger` (`@ambient/logger`): `logger`, `createLogger(area, context)`,
  `buildLogger(options)`, `AppError`, and `scrub` / `scrubString` in `scrub.ts`.
  pino 10.4.0 and pino-pretty 13.2.0, pinned; pretty output runs in-process
  (`sync: true`), no worker thread, and Next.js already treats both as server
  externals.
- Wired into the AI engine (failed calls logged with codes; the usage-log
  write failure) and the `seed`, `indexes` and `inspect` scripts. Script errors
  add a redacted `detail` message, since a person running a local tool needs it.
  `inspect`'s report stays plain console output.
- CI runs the logger tests.
- **Verified:** 9 logger tests (masking at any depth, free text removed,
  strings with URIs, bearer tokens, keys, emails and phones masked; dates and
  ids untouched; child context redacted; levels; error handling); all 24 db
  and 165 web tests; lint, typecheck and build clean. Real output checked: a
  readable dev line, and a production JSON line with the key masked, the prompt
  removed and the email masked.
- **Lessons:** pino runs the log formatter before serializers, so redaction
  must leave `Error` objects to the error serializer. pino's bindings formatter
  only covers the root logger, so `child()` context needed its own redaction;
  a test caught both.
