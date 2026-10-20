# Architecture decision records

One file per significant decision: the context, what we chose, and what it
costs. Status is **Proposed** (needs agreement), **Accepted**, or
**Superseded by NNNN**.

| # | Decision | Status |
| --- | --- | --- |
| [0001](0001-mongodb.md) | MongoDB Atlas as the primary datastore | Accepted |
| [0002](0002-nextjs-cache-components.md) | Next.js 16 with Cache Components; server actions for writes | Accepted |
| [0003](0003-monorepo-zod-models.md) | pnpm monorepo with Zod-first models | Accepted |
| [0004](0004-multi-tenancy.md) | Multi-tenancy by `tenantId` on every document | Accepted |
| [0005](0005-hosting-and-sign-in.md) | Hosting on Vercel + Atlas; sign-in with Microsoft Entra ID | Proposed |
| [0006](0006-ai-provider.md) | OpenAI through the AI SDK, on one AI engine | Accepted |

To add one, copy the shape of an existing record, take the next number, and
link it here.
