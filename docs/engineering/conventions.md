# Code conventions

## Reading data

- Server-only read models live in `apps/web/lib/data/*.ts` and start with
  `const scope = await getScope()`.
- Every query includes `...scope.filter()` (tenant, owner field and division
  lens) or, for collections with no owner, `...scope.tenant()`, plus
  `deletedAt: null` for app-native collections. A query without one of them is a
  bug, even if today's caller is an admin.
- Fetch in parallel with `Promise.all`; join names in one follow-up query, not
  per row.
- Return plain, serialisable objects shaped for the page (see
  `getDashboard()`), not raw documents.

## Writing data

Follow [`app/actions/tasks.ts`](../../apps/web/app/actions/tasks.ts):

```ts
"use server";
export async function doThing(raw: unknown) {
  const input = schema.parse(raw);                 // 1. validate
  const scope = await getScope();                  // 2. who, and what they may see
  await client.withSession((s) => s.withTransaction(async () => {
    const before = await col.findOne({ _id: input.id, ...scope.filter() }, { session: s });
    if (!before) throw new Error("Not found.");    // 3. re-check inside scope
    await col.updateOne(/* … */, { session: s });
    await audit(scope.user, { /* before, after */ }, s);  // 4. audit in the same transaction
  }));
  refresh();                                       // 5. re-render
}
```

## Components

- Server components by default. Add `"use client"` only for interaction, and keep
  client components small (the dashboard's `TaskCheck`, `WeekCalendar`).
- Per-user server components render inside `Suspense` or a route's `loading.tsx`.
- Use the design-system classes and primitives; new visual patterns go into
  `globals.css` and [the design system doc](../design/design-system.md) first.
- Icons from `lucide-react`, sized 15–20.

## Models

- Add or change shapes only in `packages/db/src/models.ts`; add indexes next to
  them in `indexes.ts`.
- New enum values are added to the Zod enum; there are no database enums.

## Style

- TypeScript strict; no `any`. Parse unknown input with Zod at the boundary.
- Names say what things are (`getRepScope`, `ownerFilter`), comments say why.
- Files use LF line endings and no BOM.
- Formatting: ESLint (Next config) must pass.

## Demo data

Seed and fixture data stay fictional: no real companies, people, brands or
customer figures.
