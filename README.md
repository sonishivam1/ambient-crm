# Ambient CRM

The CRM that fills itself in. Ambient captures customer email and meetings
automatically, files them on each account's timeline, and puts an AI assistant
(Cara) on top, so account managers spend their time with customers rather than
logging activity.

## Stack

| Layer | Choice |
| --- | --- |
| Web | Next.js 16 (App Router, Cache Components, Turbopack), React 19, TypeScript strict |
| UI | Tailwind CSS 4 design tokens (navy and coral, light and dark), Radix primitives, lucide icons, sonner, cmdk |
| Data | MongoDB 8 (official driver) with Zod schemas as the single source of truth |
| Workspace | pnpm workspaces: `apps/web`, `packages/db` |
| Runtime | Node.js 24 (`.node-version`) |

## Getting started

Prerequisites: Node.js 24, pnpm 10 and Docker Desktop.

```bash
pnpm install
cp .env.example apps/web/.env.local
cp .env.example packages/db/.env
pnpm db:up        # local MongoDB (Atlas Local: replica set + vector search)
pnpm db:seed      # fictional demo data; refuses to run against a non-local database
pnpm dev          # http://localhost:3000
```

Sign-in is a development stand-in: the gear icon in the top bar switches between
six seeded users, one per role. It only works with `AMBIENT_DEV_AUTH=1` outside
production. Real sign-in replaces it before any deployment.

## Layout

```
apps/web
  app/(app)/          every signed-in route; layout.tsx is the shell
  app/actions/        server actions (each one checks scope and writes an audit row)
  components/shell/   sidebar, top bar, Ctrl K palette, Cara tab
  components/ui/      design-system primitives
  lib/auth/           session, roles, account visibility
  lib/data/           server-only queries, always through getScope()
packages/db
  src/models.ts       Zod schemas for every collection
  src/indexes.ts      index definitions (pnpm db:indexes)
  scripts/seed.ts     local demo data
```

## Core rules

- **Visibility.** Every query goes through `getScope()`. User: own book. Manager:
  plus direct reports. Senior manager: whole reporting subtree (`$graphLookup` on
  `managerRepId`). Lead and super admin: everything. Admin is a separate ladder
  and grants no account visibility on its own.
- **Audit.** Every write records an `auditLog` row in the same transaction, with
  before and after state but never note or email bodies.
- **Ownership classes.** Mirror data (reps, groups, accounts, contracts) is
  read-only in the app and comes from the customer's ERP or warehouse. Rollups are
  dated snapshots. App-native data is soft-deleted (`deletedAt`, `deletedBy`).
- **Division lens.** Senior roles can narrow to one division. Tasks and visits
  carry the account's division so the lens needs no join.

## Progress

| Area | State |
| --- | --- |
| Design system, light and dark mode, app shell, Ctrl K palette | Done |
| Dashboard | Done (live data, task completion) |
| Accounts, profile, contracts, contacts, tasks, call cycle, notifications | Placeholder pages |
| Sign-in, hosting, CI/CD | Not started |
| Warehouse sync into the mirror collections | Not started |
| Email and meeting capture, review queue, Outlook add-in | Not started |
| AI layer: analysis, vector search, Cara, morning brief, smart tasks | Not started |
| Team overview, reports, CRM usage, admin tools | Placeholder pages |

Each placeholder page lists what it must do when built.
