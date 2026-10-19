# Architecture overview

## System context

Who uses Ambient and what it talks to.

```mermaid
flowchart TB
  rep(["Account manager"])
  mgr(["Manager / senior manager"])
  admin(["Admin"])
  ambient["Ambient"]
  m365["Microsoft 365<br/>Entra ID, Exchange, Teams"]
  erp["Customer ERP or data warehouse<br/>accounts, sales, orders, contracts"]
  llm["LLM and embedding provider"]
  bi["BI tool<br/>deep links only"]

  rep -->|"browser, Outlook add-in"| ambient
  mgr -->|browser| ambient
  admin -->|browser| ambient
  ambient -->|"sign-in, mail, calendar, transcripts"| m365
  ambient <-->|"nightly sync"| erp
  ambient -->|"analysis, chat, embeddings"| llm
  ambient -.->|links| bi
```

## Containers

| Container | Responsibility | Tech | Status |
| --- | --- | --- | --- |
| Web app | All pages, server actions, route handlers, Cara chat streaming | Next.js 16 (App Router, Cache Components), React 19 | Built (shell, dashboard) |
| Database | Operational store, vector index, audit log | MongoDB Atlas (replica set, Atlas Search and Vector Search) | Built (schema for current pages) |
| Capture workers | Poll Graph for mail and meetings, match, store, queue analysis | Node.js workers on a schedule | Planned |
| Analysis pipeline | Redact, analyse, embed captured content | AI SDK + LLM provider, queue-driven | Planned |
| Sync job | Pull mirror and rollup data from the customer's systems, push app-native data back | Node.js scheduled job | Planned |
| Outlook add-in | "Send to Ambient" from Outlook | React task pane, Office SSO | Planned |
| Blob storage | Raw email bodies and meeting transcripts | Object storage | Planned |

```mermaid
flowchart LR
  subgraph clients["Clients"]
    browser["Browser"]
    addin["Outlook add-in"]
  end
  subgraph app["Ambient"]
    web["Web app<br/>pages + server actions"]
    capture["Capture workers"]
    analysis["Analysis pipeline"]
    sync["Sync job"]
    queue[["Job queue"]]
    db[("MongoDB Atlas")]
    blob[("Blob storage")]
  end
  msgraph["Microsoft Graph"]
  erp["ERP / warehouse"]
  llm["LLM provider"]

  browser --> web
  addin --> web
  web <--> db
  capture --> msgraph
  capture --> db
  capture --> blob
  capture --> queue
  queue --> analysis
  analysis --> blob
  analysis --> llm
  analysis --> db
  web --> llm
  sync <--> erp
  sync <--> db
```

## Request lifecycle (built)

Every signed-in page and action follows the same path, so visibility can't be
forgotten.

```mermaid
sequenceDiagram
  autonumber
  participant B as Browser
  participant L as App layout (static shell)
  participant P as Page / server action
  participant S as getScope()
  participant DB as MongoDB
  B->>L: GET /
  L-->>B: static shell streams immediately
  L->>P: render inside Suspense
  P->>S: getScope()
  S->>S: connection() — request time only
  S->>DB: load user (session cookie)
  S->>DB: rep scope ($graphLookup for senior roles)
  S-->>P: user, rep scope, division lens, filter()
  P->>DB: queries with scope.filter()
  DB-->>P: scoped results
  P-->>B: streamed HTML
```

## Code layout

```
apps/web
  app/layout.tsx            root: font, colour-mode boot script, toaster
  app/(app)/layout.tsx      signed-in shell: sidebar, top bar, palette, Cara tab
  app/(app)/**/page.tsx     one folder per route
  app/actions/              server actions (writes and palette search)
  components/shell/         shell pieces; slots.tsx loads their data on the server
  components/ui/            design-system primitives
  components/dashboard/     dashboard client widgets
  lib/auth/                 session, roles, visibility
  lib/data/                 server-only read models (scope.ts, dashboard.ts)
packages/db
  src/models.ts             Zod schemas → TypeScript types
  src/client.ts             one MongoClient per process, typed collections
  src/indexes.ts            index definitions
  scripts/                  seed, indexes, inspect
```

## Quality attributes

| Attribute | How it is met |
| --- | --- |
| Correct access | One scope function for every query; writes re-check scope in a transaction |
| Traceability | Audit row for every write; AI invocation log for every model call (planned) |
| Speed | Static shell streams first; per-user data streams behind Suspense; indexed queries |
| Privacy | Participant fence on captured content; PII redaction before AI; no secrets in git |
| Evolvability | Zod models in one package; decision records for every significant choice |
