# Working in Ambient CRM

- Reuse the component classes in `apps/web/app/globals.css` and the primitives in `apps/web/components/ui` instead of inventing new styles. There is one palette with light and dark modes (`html[data-dark]`).
- Server data access goes through `getScope()` (`apps/web/lib/data/scope.ts`); never query a collection without its scope filter.
- Writes are server actions that parse input with Zod, check scope, and write an audit row in the same transaction (see `app/actions/tasks.ts`).
- Shapes live in `packages/db/src/models.ts`; add indexes in `packages/db/src/indexes.ts`.
- Next.js 16 with Cache Components: anything per user must sit behind `getCurrentUser()` (which calls `connection()`) and inside a Suspense boundary or `loading.tsx`.
- Seed and demo data must stay fictional: no real companies, people or brands.
- Write files with LF line endings and no BOM.
- Write tests with every feature (see `docs/engineering/testing.md`): integration tests for read models and actions, including out-of-scope and other-tenant cases, and audit rows for writes.
- Checks: `pnpm test` (needs local MongoDB), `pnpm --filter web typecheck`, `pnpm --filter web exec eslint .`, `pnpm --filter @ambient/db exec tsc --noEmit`.
