# Ambient CRM

The CRM that fills itself in. Ambient captures customer email and meetings
automatically, files them on each account's timeline, and puts an AI assistant
(Wren) on top, so account managers spend their time with customers rather than
logging activity.

[![CI](https://github.com/sonishivam1/ambient-crm/actions/workflows/ci.yml/badge.svg)](https://github.com/sonishivam1/ambient-crm/actions/workflows/ci.yml)

**Documentation:** start at [docs/](docs/README.md): product, architecture
(with decision records), design system, engineering, technical and marketing.
**Contributing** (people or coding agents): read [CLAUDE.md](CLAUDE.md) first.
It lists the rules every change follows and the definition of done.
**History:** the [build log](docs/engineering/build-log.md) (how and why each
change was made), the [plans](docs/plans/) behind each step, and the
[changelog](CHANGELOG.md).

## What's in it today

The core CRM screens run end to end on fictional demo data:

| Page | What you can do |
| --- | --- |
| Dashboard | Today's tasks, the week's visits, KPIs, at-risk accounts, notifications |
| Accounts | Customer groups, bill-tos and sold-tos with filters, search and drill-down; a profile per account and per group |
| Tasks | Today and all views; create, edit, assign (managers), complete, cancel |
| Contacts | A directory with search and role filters; add, edit, deactivate |
| Call cycle | The next six weeks as a list or week grid; plan, reschedule, cancel; complete with a post-visit scorecard |
| Notifications | Your history by day; mark read or all read |
| Contracts | Renewal bands (ended, 30, 60, 90 days, later) with search; a card on each profile |

Every page respects the tenant, the user's role visibility and the division
lens, and shows dates on the tenant's calendar. Sign-in, the warehouse sync,
email capture and the AI assistant come next (see the
[roadmap](docs/product/roadmap.md)).

## Stack

| Layer | Choice |
| --- | --- |
| Web | Next.js 16 (App Router, Cache Components, Turbopack), React 19, TypeScript strict |
| UI | Tailwind CSS 4 design tokens (navy and coral, light and dark), Radix primitives, lucide icons, sonner, cmdk |
| Data | MongoDB 8 (official driver) with Zod schemas as the single source of truth |
| Workspace | pnpm workspaces: `apps/web`, `packages/db` |
| Runtime | Node.js 24 (`.node-version`) |

## Getting started

Prerequisites: Node.js 24, pnpm 10 and a MongoDB Atlas cluster. Full steps
and troubleshooting: [getting started](docs/engineering/getting-started.md).

```bash
pnpm install
cp .env.example apps/web/.env.local
cp .env.example packages/db/.env
# put your Atlas mongodb+srv:// URI in both files (see below)
pnpm --filter @ambient/db seed --allow-remote   # fictional demo data
pnpm dev          # http://localhost:3000
```

| Command | What it does |
| --- | --- |
| `pnpm lint` / `pnpm typecheck` | ESLint; route types and `tsc` for every package |
| `pnpm test` | Web unit and integration tests (integration in throwaway `ambient_test_*` databases on Atlas) |
| `pnpm --filter @ambient/db test` | db package tests (no database) |
| `pnpm build` | Production build (needs no database) |
| `pnpm db:inspect` | Read-only: what the database holds |

CI runs all of these on every push and pull request, with the integration
suite against a throwaway MongoDB container instead of Atlas.

Docker is optional: `pnpm db:up` starts a local MongoDB if you need to work
offline.

### Using MongoDB Atlas

Put the cluster's `mongodb+srv://` connection string in both env files (they are
gitignored; never commit it) and allow your IP in Atlas → Network Access. Then:

```bash
pnpm db:inspect                                        # read-only: what the database holds
pnpm --filter @ambient/db seed --allow-remote          # seed an empty remote database
pnpm --filter @ambient/db seed --allow-remote --reset  # wipe and reseed a remote database
```

Seeding drops every collection in `MONGODB_DB` first. Against anything but
localhost it refuses without `--allow-remote`, and refuses to wipe a database that
already holds data without `--reset`.

### Demo tenants and users

Sign-in is a development stand-in: the gear icon in the top bar switches
between the seeded users. It only works with `AMBIENT_DEV_AUTH=1` outside
production; real sign-in replaces it before any deployment.

| Tenant | Time zone and divisions | Users (role) |
| --- | --- | --- |
| Northwind | Australia/Sydney; wholesale, uniforms, ICW, other | Priya Nair (user), Liam Carter (manager), Grace Whitfield (senior manager), Noah Bennett (lead), Sam Patel (admin), Alex Morgan (super admin) |
| Harbor & Finch | Pacific/Auckland; trade, institutional | Zara Ahmed (user), Owen Price (manager), Rita Lopez (super admin) |

The two tenants deliberately share some account codes and a contact's email, to
prove nothing leaks between them.

## Layout

```
apps/web
  app/(app)/            every signed-in route; layout.tsx is the shell
  app/actions/          server actions (each one checks scope and writes an audit row)
  components/<area>/    dialogs and controls per area (tasks, contacts, visits, …)
  components/shell/     sidebar, top bar, Ctrl K palette, Wren tab
  components/ui/, forms/ design-system primitives and shared form fields
  app/api/v1/           versioned HTTP routes (defineRoute); app/api/health
  lib/data/             server-only read models, always through getScope()
  lib/*.ts              pure rules shared by server and client, with unit tests
  lib/auth/             session, roles, account visibility
  tests/integration/    integration suites, one per area
packages/logger         structured, redacted logging (pino)
packages/db
  src/models.ts         Zod schemas for every collection
  src/indexes.ts        index definitions (pnpm db:indexes)
  src/fixtures.ts       fictional demo data, shared by the seed and the tests
  src/time.ts           tenant-calendar date helpers
  scripts/              seed, indexes, inspect
.github/workflows/      CI
```

## Core rules

- **Tenancy.** Every document carries `tenantId` and every query gets it from
  `getScope()` (ADR 0004).
- **Visibility.** Every query goes through `getScope()`. User: own book. Manager:
  plus direct reports. Senior manager: whole reporting subtree (`$graphLookup` on
  `managerRepId`). Lead and super admin: everything. Admin is a separate ladder
  and grants no account visibility on its own.
- **Audit.** Every write records an `auditLog` row in the same transaction, with
  before and after state but never note or email bodies.
- **Ownership classes.** Mirror data (reps, groups, accounts, contracts) is
  read-only in the app and comes from the customer's ERP or warehouse. Rollups are
  dated snapshots. App-native data is soft-deleted (`deletedAt`, `deletedBy`).
- **Division lens.** Each tenant defines its own divisions and lenses (a lens
  groups one or more divisions). Senior roles can narrow to a lens. Tasks,
  visits, interactions, contacts and contracts carry the account's division
  (contacts and contracts its owner too), so the lens and visibility need no
  join.
- **Tenant time zone.** "Today", "overdue", due dates and every displayed date
  use the tenant's time zone, never the server's or the browser's.

## Progress

| Area | State |
| --- | --- |
| Design system, light and dark mode, app shell, Ctrl K palette | Done |
| Dashboard | Done (live data, task completion) |
| Multi-tenancy (`tenantId` everywhere, two seeded tenants) | Done |
| Automated tests: unit + integration in throwaway databases (Atlas locally, a MongoDB container in CI) | Done |
| Accounts list: views, filters, search, sort, drill-down | Done |
| Customer profile: timeline, log interaction, tasks, contacts, contracts, plan a visit, related accounts | Done |
| Tasks: today and all views, filters, create, edit, assign, cancel | Done |
| Customer group page: health mix, bill-to drill-down, recent activity | Done |
| Tenant settings: own divisions and lenses, own time zone for dates | Done |
| Contacts: directory, add, edit, deactivate, profile card, Ctrl K | Done |
| Call cycle: six weeks, week grid, plan, reschedule, cancel, post-visit report | Done |
| Notifications: history by day, filters, mark read / all read | Done |
| Contracts: renewal bands, search, profile card (read-only) | Done |
| CI: lint, typecheck, unit and integration tests, build on every push | Done |
| Sign-in, hosting, deployments | Not started |
| Warehouse sync into the mirror collections | Not started |
| Email and meeting capture, review queue, Outlook add-in | Not started |
| AI engine core: OpenAI client, gates, tenant AI policy, budgets, rate limits, usage log (no visible feature yet) | Done |
| Logging across the app (request ids, every server action, API request and server error) and versioned APIs (`defineRoute`, `/api/health`, `/api/v1/me`), enforced by guard tests | Done |
| AI features: account summary, morning brief, Wren chat, proposals; later email analysis and search | Not started |
| Team overview, reports, CRM usage, admin tools | Placeholder pages |

Each placeholder page lists what it must do when built.
