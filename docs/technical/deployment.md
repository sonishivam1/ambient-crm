# Deployment

**Status: planned.** Nothing is deployed yet; the app runs locally against
MongoDB Atlas. Hosting follows [ADR 0005](../architecture/decisions/0005-hosting-and-sign-in.md)
once it is accepted.

## Environments

| Environment | Purpose | Database | Data | Sign-in |
| --- | --- | --- | --- | --- |
| Local | Development | Atlas cluster0 (`ambient_crm`) or local Docker | Fictional seed | Development role switcher |
| Preview | One per pull request | Shared preview database | Fictional seed | Entra (test tenant) |
| Staging | Release candidate, demos | Staging cluster | Fictional seed + test mailboxes | Entra (test tenant) |
| Production | Customers | Production cluster per region | Customer data | Entra (customer tenants) |

## Target topology

```mermaid
flowchart TB
  user(["Users"]) --> edge["Vercel edge / CDN"]
  edge --> web["Next.js app<br/>(serverless functions)"]
  web --> atlas[("MongoDB Atlas<br/>same region")]
  jobs["Job runner<br/>capture · analysis · sync"] --> atlas
  jobs --> msgraph["Microsoft Graph"]
  jobs --> llm["LLM provider"]
  web --> llm
  jobs --> blob[("Blob storage")]
  secrets["Encrypted env settings"] -.-> web
  secrets -.-> jobs
```

## Pipeline (planned)

```mermaid
flowchart LR
  pr["Pull request"] --> ci["CI<br/>install · typecheck · lint · test"]
  ci --> prev["Preview deploy"]
  prev --> review["Review + checks"]
  review --> merge["Merge to main"]
  merge --> stg["Deploy staging"]
  stg --> smoke["Smoke test<br/>health, sign-in redirect"]
  smoke --> tag["Tag vYYYY.MM.DD"]
  tag --> prod["Deploy production"]
```

## Release checklist

- [ ] CI green on the commit being released
- [ ] Database indexes applied (`pnpm db:indexes`) before code that needs them
- [ ] New environment variables set in every environment
- [ ] Development sign-in disabled (`AMBIENT_DEV_AUTH` unset; production ignores it anyway)
- [ ] Smoke test: signed-out request redirects to sign-in; dashboard loads for a test user
