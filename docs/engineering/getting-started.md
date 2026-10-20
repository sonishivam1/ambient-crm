# Getting started

## Prerequisites

| Tool | Version | Notes |
| --- | --- | --- |
| Node.js | 24 (`.node-version`) | With fnm: `fnm install 24` then `fnm use` in the repo. On Windows you can also run one-off commands with `fnm exec --using=24 -- pnpm.cmd …` |
| pnpm | 10 | `npm install -g pnpm` |
| Database | A MongoDB Atlas cluster | Docker is optional: `pnpm db:up` runs a local MongoDB if you ever need one offline |

## First run

```bash
git clone https://github.com/sonishivam1/ambient-crm.git
cd ambient-crm
pnpm install
cp .env.example apps/web/.env.local
cp .env.example packages/db/.env
```

Then pick a database.

**Atlas:** put your `mongodb+srv://…` string in both env files, add your IP in
Atlas → Network Access, then:

```bash
pnpm db:inspect                                # check the connection, read-only
pnpm --filter @ambient/db seed --allow-remote  # seeds an empty database
```

**Local Docker:**

```bash
pnpm db:up
pnpm db:seed
```

Start the app:

```bash
pnpm dev   # http://localhost:3000
```

Use the gear icon in the top bar to sign in as any seeded user: six roles in
Northwind and three in Harbor & Finch (see the README).

## Everyday commands

| Command | What it does |
| --- | --- |
| `pnpm dev` | Web app with hot reload |
| `pnpm test` | Unit and integration tests (integration uses the Atlas cluster, in throwaway `ambient_test_*` databases) |
| `pnpm test:unit` | Unit tests only, no database |
| `pnpm typecheck` | Generate route types, then type-check every package |
| `pnpm lint` | Lint |
| `pnpm --filter @ambient/db test` | db package tests (no database) |
| `pnpm build` | Production build (needs no database) |
| `pnpm db:inspect` | List databases and collection counts |
| `pnpm db:indexes` | Create or update indexes |
| `pnpm db:seed` | Reseed a local database |

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `Error parsing package.json` / `Unexpected token` at character 1 | A file was saved with a byte-order mark (PowerShell `Set-Content -Encoding utf8` does this). Re-save as UTF-8 without BOM, delete `apps/web/.next`, restart. |
| Old error persists after a fix | Turbopack caches to disk: stop the server, delete `apps/web/.next`, start again. |
| A change to `globals.css` doesn't show up | The dev server occasionally misses stylesheet edits. Restart `pnpm dev` (no need to clear `.next`). |
| `Cannot find name 'LayoutProps'` | Route types are generated: run `pnpm --filter web typecheck` (it runs `next typegen`). |
| Atlas connection times out | Your IP is not in the Atlas access list, or a VPN changed your IP. |
| `Refusing to seed a remote database` | Intended. Add `--allow-remote` (and `--reset` to wipe existing data). |
| Docker: `failed to connect to the docker API` | Start Docker Desktop and wait for the engine. |
| `new Date()` "while prerendering" | Per-user code ran before a request-time boundary. Read data through `getScope()` / `getCurrentUser()`; see [ADR 0002](../architecture/decisions/0002-nextjs-cache-components.md). |
