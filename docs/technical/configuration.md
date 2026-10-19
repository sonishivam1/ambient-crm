# Configuration

Configuration is environment variables only. In development they live in two
gitignored files, `apps/web/.env.local` (web app) and `packages/db/.env` (db
scripts), both copied from [`.env.example`](../../.env.example). In deployed
environments they are set in the host's encrypted settings.

## Variables

| Variable | Used by | Required | Example | Notes |
| --- | --- | --- | --- | --- |
| `MONGODB_URI` | web, db scripts | yes | `mongodb+srv://user:***@cluster0.example.mongodb.net/?retryWrites=true&w=majority&appName=ambient-crm` | Secret. Local Docker: `mongodb://localhost:27017/?directConnection=true` |
| `MONGODB_DB` | web, db scripts | no (`ambient_crm`) | `ambient_crm` | Database name inside the cluster |
| `AMBIENT_DEV_AUTH` | web | development only | `1` | Enables the development role switcher. Ignored when `NODE_ENV=production`. |

Planned, as features land:

| Variable | For |
| --- | --- |
| `AUTH_SECRET`, `AUTH_MICROSOFT_ENTRA_ID_ID`, `AUTH_MICROSOFT_ENTRA_ID_SECRET` | Entra sign-in |
| `GRAPH_CLIENT_ID`, `GRAPH_CLIENT_SECRET` | Capture workers (Microsoft Graph, application permissions) |
| `ANTHROPIC_API_KEY`, `EMBEDDINGS_API_KEY` | AI layer |
| `BLOB_*` | Email body and transcript storage |
| `SYNC_SOURCE_*` | Per-tenant ERP / warehouse connector settings (stored per tenant, not in env, once tenancy lands) |

## Cookies

| Cookie | Set by | Purpose |
| --- | --- | --- |
| `amb_dark` | client | light/dark mode (`1` = dark) |
| `amb_lens` | server action | division lens for senior roles |
| `amb_dev_user` | server action, development only | seeded user to sign in as (httpOnly) |

## Rules

- A secret never appears in git, logs, screenshots or chat. If one does, rotate it.
- Each environment has its own database user; production users get only the
  permissions their job needs.
