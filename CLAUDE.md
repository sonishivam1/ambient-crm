# Ambient CRM: guide for coding agents

Ambient is a multi-tenant CRM for B2B account managers: accounts, contacts,
tasks, visits and contracts today; automatic email and meeting capture and an
AI assistant (**Wren**) later. It is our own product. Keep every name, brand,
customer and figure fictional (see "Demo data").

Read this file before changing anything. Product and architecture detail lives
in [`docs/`](docs/README.md); this file is the short list of what every change
must respect.

## Where we are (20 Oct 2026)

- **Built (Phase 2 core CRM):** dashboard, accounts list with drill-down,
  customer profile and group page, tasks, contacts, call cycle with post-visit
  reports, notifications, contracts with renewal bands. Also multi-tenancy, role
  visibility, per-tenant divisions, lenses and time zones, and CI.
- **Next: the AI layer, step by step** on OpenAI
  ([ADR 0006](docs/architecture/decisions/0006-ai-provider.md),
  [plan](docs/architecture/ai.md), [prompts](docs/architecture/ai-prompts.md)).
  Step 1 (engine core) is built; step 2 (fact sources and cards) is next.
  The real model is tried only once the team's OpenAI key arrives; until then
  tests use the test-only stand-in (`tests/support/ai-stand-in.ts`).
- **Not built:** real sign-in and hosting (waits on
  [ADR 0005](docs/architecture/decisions/0005-hosting-and-sign-in.md)),
  warehouse/ERP sync into the Mirror collections, email and meeting capture,
  manager and admin pages (placeholders).
- The live plan is [`docs/product/roadmap.md`](docs/product/roadmap.md).

## Commands

Node 24 and pnpm 10. On Windows with fnm, prefix commands with
`fnm exec --using=24 --` and call `pnpm.cmd`.

| Command | What it does |
| --- | --- |
| `pnpm dev` | Web app at http://localhost:3000 |
| `pnpm lint` | ESLint |
| `pnpm typecheck` | `next typegen` and `tsc` for every package |
| `pnpm test` | Web unit and integration tests (integration uses Atlas, in throwaway `ambient_test_*` databases) |
| `pnpm --filter @ambient/db test` | db package tests (pure, no database) |
| `pnpm --filter @ambient/logger test` | logger tests (redaction, levels, errors) |
| `pnpm test:unit` | Web unit tests only, no database |
| `pnpm build` | Production build; must never need a database |
| `pnpm db:inspect` | Read-only: databases and collection counts |
| `pnpm --filter @ambient/db seed --allow-remote --reset` | Wipe and reseed the demo data on Atlas |

CI ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)) runs lint,
typecheck, unit tests, the build and the integration suite (against a
throwaway `mongodb-atlas-local` container) on every push and pull request.
Keep it green.

## Layout

```
apps/web/
  app/(app)/<route>/page.tsx   pages; per-user content inside <Suspense>
  app/actions/*.ts             server actions ("use server"), one file per area
  components/<area>/           client components for an area (dialogs, controls)
  components/ui/, forms/       design-system primitives, shared form fields
  components/shell/            sidebar, top bar, Ctrl K palette
  lib/data/*.ts                server-only read models, always through getScope()
  lib/data/scope.ts            getScope(): tenant, rep scope, lens, time zone
  lib/*.ts                     pure rules shared by server and client (format,
                               lens, contacts, visits, contracts) with *.test.ts
  lib/auth/                    dev session, roles, visibility
  tests/integration/*.test.ts  integration suites (one per area)
  tests/support/               test database, cookie jar, signInAs()
  app/globals.css              every component class and design token
packages/logger/src/           @ambient/logger: createLogger(), redaction (scrub.ts)
packages/db/src/
  models.ts                    Zod schemas: the single source of truth
  indexes.ts                   indexes, all prefixed with tenantId
  fixtures.ts                  fictional demo data (seed and tests share it)
  time.ts                      tenant-calendar helpers (pure Intl)
docs/                          product, architecture, design, engineering
docs/plans/                    one plan per step; As built filled in when done
docs/engineering/build-log.md  history of every change, newest first
```

## Rules every change follows

**Data access**
- Every read model starts with `const scope = await getScope()`. Every query
  spreads `...scope.filter()` (tenant + rep scope + division lens; pass the
  owner field, e.g. `scope.filter("repId")` for visits) or, for collections
  with no owner, `...scope.tenant()`. App-native collections also add
  `deletedAt: null`. A query without these is a bug.
- Something outside the user's scope or tenant is "not found", never
  "forbidden", so existence doesn't leak.
- Collections that need the lens or visibility copy `division` (and contacts and
  contracts copy `ownerRepId`) from their account at write time. The sync must
  refresh copies when the source changes.

**Writes**
- Server actions only. Parse input with Zod (rules shared with the UI live in
  `lib/<area>.ts`), call `getScope()`, re-check scope inside a transaction, and
  write an `audit()` row in the same transaction. Model a new action on
  `app/actions/tasks.ts` or `app/actions/contacts.ts`.
- Audit rows never hold free text or personal details: note, description,
  summary, report key points, contact names, emails and phones. Record that
  they changed (`personalFieldsChanged`, `hasKeyPoints`), not their values.
  Notification read state is the one write without an audit row.
- Call `refresh()` after a successful write.

**Tenants, time and divisions**
- Every document has `tenantId`; every index starts with it (ADR 0004).
- Divisions, lenses and contact roles come from the tenant document, never from
  code. Labels too.
- "Today", "overdue", week starts, due dates and every displayed date use the
  tenant's time zone (`scope.timeZone`, `scope.today`) through
  `@ambient/db/time` and the formatters in `lib/format.ts`, which all take a
  `timeZone`. Never `new Date().setHours(0)`, `getDate()` or a formatter
  without a zone.

**Next.js 16 (Cache Components)**
- Per-user code runs behind `getCurrentUser()` (which calls `connection()`) and
  renders inside a `<Suspense>` on the page. `usePathname`/`useSearchParams` in
  client components need a Suspense boundary above them.
- Client components must not import `@ambient/db` (it pulls in the MongoDB
  driver). Use `@ambient/db/time` and `@ambient/db/models` instead.
- Page state that should be shareable (filters, views, pages) lives in the URL
  and is parsed leniently with a Zod schema that `.catch()`es to defaults.

**Logging**
- `@ambient/logger`, never `console`, in server code, workers and scripts:
  `createLogger(area, { tenantId, userId })`, errors as `{ err }`, codes and ids
  as fields. Never log prompt, reply, note or email text, keys or connection
  strings; redaction in the logger is a safety net, not a licence. See
  [conventions](docs/engineering/conventions.md#logging).

**HTTP APIs** ([ADR 0007](docs/architecture/decisions/0007-api-versioning.md))
- Every route handler lives under `/api/v1/…` (`app/api/v1/<area>/<name>/route.ts`)
  with Zod schemas beside it; only `/api/health` is unversioned. Within v1,
  changes are additive; a breaking change is `/api/v2`. Errors are
  `{ error: { code, message } }`. Server actions are not versioned.

**UI**
- Reuse the classes in `apps/web/app/globals.css` and the primitives in
  `components/ui` and `components/forms`. One palette (navy and coral) with
  light and dark modes. New visual patterns go into `globals.css` and
  [the design system](docs/design/design-system.md) first.
- Segment controls (`.seg`) and chips work for both links and buttons. Tables
  use `.tbl` inside `.tbl-wrap`; cells don't wrap unless you add
  `whitespace-normal`. Check a new table at 1400px wide without scrolling.
- Icons from `lucide-react` (v1 names, e.g. `Building`, `CircleQuestionMark`).

**AI** (the design and its rules: [AI layer](docs/architecture/ai.md))
- One engine: every AI capability is a definition in `apps/web/lib/ai/`
  (`defineAiFeature`, `defineAiTool`, fact sources, cards, triggers) run by
  `runAiFeature`. Nothing outside `lib/ai/` imports the AI SDK or calls OpenAI.
- OpenAI only. `OPENAI_API_KEY`, `OPENAI_MODEL`, `OPENAI_MODEL_STRONG` are
  server-only; never log the key or send it to the client. No free or local
  models.
- Facts come only from fact sources on scoped read models (`getScope()`), with
  handles instead of ids, allowed fields only, and customer text fenced as
  `<untrusted>`. The model never reaches the database.
- Verify, then show: schema and handles are checked before anything is
  displayed; figures appear on cards rendered from records.
- Tools return `{ ok: true, facts, cards }` or `{ ok: false, reason, ask }`;
  propose tools never write. Accept runs the existing server action
  (scope check, audit row), idempotent by proposal id.
- `aiInvocations` holds metadata only, never prompt or reply text.
- Prompts are versioned modules matching
  [AI prompts](docs/architecture/ai-prompts.md); change both and bump the
  version together.
- Output schemas use `.nullable()`, never `.optional()` or `.default()`
  (OpenAI strict structured outputs need every field present).
- Tests use the test-only stand-in model, swapped in with
  `vi.mock("@/lib/ai/client")`; CI never calls OpenAI. Quality is
  measured with `pnpm ai:eval` on key day and on every prompt or model change.

**Demo data**
- `packages/db/src/fixtures.ts` holds two fictional tenants: Northwind
  (Australia/Sydney, wholesale/uniforms/ICW/other) and Harbor & Finch
  (Pacific/Auckland, trade/institutional). No real companies, people, brands,
  domains (use `.example`) or customer figures.

## Definition of done for a feature

0. Write the step's plan in `docs/plans/` (from the template) and agree it
   before building.
1. Model and indexes in `packages/db`, fixtures for both tenants, and a
   `fixtures.test.ts` check.
2. Read model in `lib/data`, actions in `app/actions`, pure rules in `lib/<area>.ts`.
3. Page and components following the rules above.
4. Tests: unit tests for the pure rules; an integration suite covering each
   read model and action, including a user outside the scope, another tenant,
   the lens, tenant-zone dates and the audit row (with its privacy). Build
   dates in tests with `addDays` and `isoDayIn` in the tenant's zone.
5. Break what the suite guards (drop the scope filter, say) and see it fail,
   then restore.
6. `pnpm lint`, `pnpm typecheck` and the tests pass.
7. Reseed Atlas if fixtures changed, then check the page in the browser as more
   than one role and at 1400px wide.
8. Update the docs in the same change: `docs/product/features.md`,
   `docs/architecture/data-model.md`, `docs/technical/server-api.md`,
   `docs/engineering/testing.md`, the README progress table, and
   `docs/product/roadmap.md` (status table, gantt, "Last updated").
9. Record it: an entry in `docs/engineering/build-log.md` (what, why, how
   verified, lessons), the plan's **As built** section, and a line in
   `CHANGELOG.md` if users would notice.

## Safety

- Never print, log or commit the Atlas connection string. It lives only in the
  gitignored `apps/web/.env.local` and `packages/db/.env`.
- Tests only ever create, write and drop `ambient_test_*` databases, never
  `ambient_crm` (guarded by `assertTestDb`).
- Seeding refuses a remote database without `--allow-remote`, and refuses to
  wipe data without `--reset`.
- Commit and push only when asked. Before committing, scan the diff for secrets
  and check line endings (`git ls-files --eol`). Conventional Commits:
  `feat(contacts): …`, `fix(ui): …`, `ci: …`, `docs: …`.
- Files are UTF-8 with LF line endings and no BOM.

## Gotchas

| Symptom | Cause and fix |
| --- | --- |
| A `globals.css` change doesn't show | Turbopack misses stylesheet edits: restart `pnpm dev` |
| `Error parsing package.json` at character 1 | A BOM (PowerShell `Set-Content -Encoding utf8` adds one). Re-save without BOM, delete `apps/web/.next` |
| `Cannot find name 'PageProps'` | Run `pnpm typecheck` (it runs `next typegen`) |
| `new Date()` "while prerendering" | Per-user code ran before `connection()`: read through `getScope()` |
| DOM measurements return 0 | Next keeps hidden copies of earlier pages; pick the visible element |
| Files gain CRLF on Windows | Write with `newline=""` in Python, or use the editor tools |
| `[IO.File]` can't find a relative path | .NET resolves from the process directory, not the PowerShell location: use absolute paths |
