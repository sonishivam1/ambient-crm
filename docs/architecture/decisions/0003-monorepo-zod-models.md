# 0003 — pnpm monorepo with Zod-first models

**Status:** Accepted (18 Oct 2026)

## Context

The web app, capture workers, sync job and Outlook add-in all read and write the
same collections. Duplicated types drift; drifted types corrupt data.

## Decision

- One pnpm workspace: `apps/*` for deployables, `packages/*` for shared code.
- `@ambient/db` owns the Mongo client, every collection's Zod schema, inferred
  types and index definitions. Nothing else defines a collection shape.
- Packages ship TypeScript source; the web app compiles them via
  `transpilePackages`.

## Consequences

- A shape change is one edit, type-checked across every consumer.
- New deployables (workers, sync, add-in) join as `apps/<name>` and import
  `@ambient/db`.
- Workers that run outside Next.js need their own build step (tsx in
  development, a bundler for production).
