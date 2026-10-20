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

## Logging

Use `@ambient/logger`, never `console`, in server code, workers and scripts:

```ts
import { createLogger } from "@ambient/logger";

const log = createLogger("ai", { tenantId: scope.tenantId, userId: scope.user._id });
log.warn({ feature: "account-summary", errorKind: "timeout" }, "AI call failed");
```

- One line per event, with codes and ids as fields and a short message.
- Context (`area`, `requestId`, `tenantId`, `userId`) goes on a child logger.
- Pass errors as `{ err }`. Errors you raise yourself use `AppError(code,
  message)`, whose message is logged; any other error is logged by name and
  code only, because its message can echo request data.
- Never log prompt, reply, note, summary or email text, or any key or
  connection string. The logger redacts them anyway (masks secrets, emails and
  phone numbers; removes free-text fields), but that is a safety net.
- The one exception to "never `console`" is a script's report written for a
  person to read (`db:inspect`).

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

## Tests

Every feature ships with its tests in the same change: an integration test for
each read model and server action (including what users outside the scope and
in another tenant see), and an audit-row test for each write. See
[testing](testing.md).

## Demo data

Seed and fixture data stay fictional: no real companies, people, brands or
customer figures. The data set lives in `packages/db/src/fixtures.ts` and is
shared by `pnpm db:seed` and the integration tests.
