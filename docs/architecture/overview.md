# Architecture overview

Colour key used in every diagram on this page: coral = people · navy = web
app · violet = AI engine · amber = safety · green = Ambient data · teal =
background jobs · grey = external systems. Dashed boxes are planned.

## System context

Who uses Ambient and what it talks to.

```mermaid
flowchart TB
  rep(["Account manager"])
  mgr(["Manager · senior manager"])
  admin(["Admin"])
  ambient["Ambient CRM"]
  m365["Microsoft 365<br/>Entra ID · Exchange · Teams"]
  erp["Customer ERP or warehouse<br/>accounts · sales · orders · contracts"]
  openai["OpenAI<br/>chat and embedding models"]
  bi["BI tool<br/>deep links only"]

  rep -->|"browser · Outlook add-in"| ambient
  mgr -->|browser| ambient
  admin -->|browser| ambient
  ambient -->|"sign-in · mail · calendar · transcripts"| m365
  ambient <-->|"nightly sync"| erp
  ambient -->|"summaries · chat · embeddings"| openai
  ambient -.->|links| bi

  classDef person fill:#FDE7E1,stroke:#E8664A,stroke-width:2px,color:#1B2340;
  classDef core fill:#13203F,stroke:#E8664A,stroke-width:3px,color:#FFFFFF;
  classDef external fill:#ECEFF3,stroke:#6B7685,stroke-width:2px,color:#1F2933;
  class rep,mgr,admin person;
  class ambient core;
  class m365,erp,openai,bi external;
```

## The whole application

Every layer, what exists today and what is planned.

```mermaid
flowchart TB
  subgraph people["People"]
    direction LR
    rep(["Account manager"])
    mgr(["Manager"])
    adm(["Admin"])
  end

  subgraph clients["Clients"]
    direction LR
    browser["Browser<br/>light and dark"]
    addin["Outlook add-in"]
  end

  subgraph web["Web app · Next.js 16"]
    direction TB
    subgraph pages["Pages"]
      direction LR
      p1["Dashboard · Accounts<br/>Profile · Group"]
      p2["Tasks · Contacts<br/>Call cycle"]
      p3["Notifications · Contracts<br/>Wren · Morning brief"]
    end
    subgraph server["Server"]
      direction LR
      actions["Server actions<br/>Zod · scope check<br/>audit row · transaction"]
      readm["Read models<br/>lib/data"]
      chat["Chat route<br/>Wren"]
    end
    scope["getScope()<br/>tenant · rep scope · lens · time zone"]
    subgraph ai["AI engine · lib/ai"]
      direction LR
      aidefs["Features · tools<br/>fact sources · cards"]
      aiengine["Gates → facts → prompt<br/>→ call → verify → log"]
    end
  end

  subgraph jobs["Background jobs"]
    direction LR
    capture["Capture workers<br/>mail · meetings"]
    sync["Sync job<br/>ERP · warehouse"]
    triggers["AI triggers<br/>events · schedules"]
  end

  subgraph data["MongoDB Atlas"]
    direction LR
    mirror[("Mirror<br/>reps · groups<br/>accounts · contracts")]
    native[("App-native<br/>tasks · visits · contacts<br/>interactions · notifications")]
    obs[("Observability<br/>auditLog · aiInvocations")]
    vec[("Vector index<br/>analyses")]
  end

  subgraph ext["External"]
    direction LR
    entra["Entra ID"]
    msgraph["Microsoft Graph"]
    erp["ERP · warehouse"]
    openai["OpenAI"]
  end

  people --> clients
  browser --> pages
  addin -.-> server
  pages --> server
  actions --> scope
  readm --> scope
  chat --> ai
  ai -->|"facts from scoped read models"| readm
  ai -->|"gated, verified calls"| openai
  scope --> data
  jobs --> data
  triggers --> ai
  capture --> msgraph
  sync <--> erp
  web -.->|"sign-in"| entra

  classDef person fill:#FDE7E1,stroke:#E8664A,stroke-width:2px,color:#1B2340;
  classDef client fill:#FDE7E1,stroke:#E8664A,stroke-width:1px,color:#1B2340;
  classDef webNode fill:#DCE6FB,stroke:#2F4A8A,stroke-width:2px,color:#13203F;
  classDef safety fill:#FFF3D6,stroke:#D49A1A,stroke-width:2px,color:#3D2A00;
  classDef aiNode fill:#EDE3FB,stroke:#7B4FD0,stroke-width:2px,color:#2A1450;
  classDef jobNode fill:#E4F4FB,stroke:#2B8CB8,stroke-width:2px,color:#0D2F3F;
  classDef dataNode fill:#DFF5EA,stroke:#2E9E6A,stroke-width:2px,color:#0F3B27;
  classDef external fill:#ECEFF3,stroke:#6B7685,stroke-width:2px,color:#1F2933;
  classDef planned stroke-dasharray:6 4;

  class rep,mgr,adm person;
  class browser,addin client;
  class p1,p2,p3,actions,readm,chat webNode;
  class scope safety;
  class aidefs,aiengine aiNode;
  class capture,sync,triggers jobNode;
  class mirror,native,obs,vec dataNode;
  class entra,msgraph,erp,openai external;
  class addin,chat,aidefs,aiengine,capture,sync,triggers,vec,entra,msgraph planned;

  style people fill:#FFF5F2,stroke:#E8664A,stroke-width:1px,color:#1B2340
  style clients fill:#FFF5F2,stroke:#E8664A,stroke-width:1px,color:#1B2340
  style web fill:#F3F6FD,stroke:#2F4A8A,stroke-width:2px,color:#13203F
  style pages fill:#FFFFFF,stroke:#2F4A8A,stroke-width:1px,color:#13203F
  style server fill:#FFFFFF,stroke:#2F4A8A,stroke-width:1px,color:#13203F
  style ai fill:#F7F2FD,stroke:#7B4FD0,stroke-width:2px,color:#2A1450
  style jobs fill:#F1F9FC,stroke:#2B8CB8,stroke-width:2px,color:#0D2F3F
  style data fill:#F0FAF5,stroke:#2E9E6A,stroke-width:2px,color:#0F3B27
  style ext fill:#F6F7F9,stroke:#6B7685,stroke-width:2px,color:#1F2933
```

What each layer does:

| Layer | Responsibility | Status |
| --- | --- | --- |
| Pages | Every signed-in screen; per-user content streams inside Suspense | Built (Phase 2); Wren and Morning brief planned |
| Server actions | Every write: Zod, scope re-check, audit row, one transaction | Built |
| Read models | Every read, through `getScope()` | Built |
| `getScope()` | Tenant, rep scope, division lens, tenant time zone: the one door to data | Built |
| AI engine | Features, tools, fact sources and cards run inside one safety layer ([AI layer](ai.md)) | Planned (step 1 next) |
| Background jobs | Mail and meeting capture, ERP sync, AI triggers | Planned |
| MongoDB Atlas | Mirror, app-native and observability collections; vector index later | Built (vector index planned) |
| External | Entra sign-in, Graph, ERP, OpenAI | Planned |

## Containers

| Container | Responsibility | Tech | Status |
| --- | --- | --- | --- |
| Web app | All pages, server actions, route handlers, Wren chat | Next.js 16 (App Router, Cache Components), React 19 | Built (core CRM) |
| AI engine | Gated, scoped, verified model calls for every AI feature | Vercel AI SDK + OpenAI, inside the web app | Planned |
| Database | Operational store, audit log, AI usage log, vector index | MongoDB Atlas (replica set, Atlas Search and Vector Search) | Built (vector index planned) |
| Capture workers | Poll Graph for mail and meetings, match, store, queue analysis | Node.js workers on a schedule | Planned |
| Sync job | Pull Mirror and rollup data, push app-native data back | Node.js scheduled job | Planned |
| Outlook add-in | "Send to Ambient" from Outlook | React task pane, Office SSO | Planned |
| Blob storage | Raw email bodies and meeting transcripts | Object storage | Planned |
| CI | Lint, typecheck, unit and integration tests, build on every push | GitHub Actions + throwaway MongoDB | Built |

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
  S->>S: connection(): request time only
  S->>DB: load user and tenant (session cookie)
  S->>DB: rep scope ($graphLookup for senior roles)
  S-->>P: user, rep scope, lens, time zone, filter()
  P->>DB: queries with scope.filter()
  DB-->>P: scoped results
  P-->>B: streamed HTML
```

## Code layout

```
apps/web
  app/layout.tsx            root: font, colour-mode boot script, toaster
  app/(app)/layout.tsx      signed-in shell: sidebar, top bar, palette, Wren tab
  app/(app)/**/page.tsx     one folder per route
  app/actions/              server actions, one file per area
  components/<area>/        dialogs and controls per area
  components/shell/         shell pieces; slots.tsx loads their data on the server
  components/ui/, forms/    design-system primitives, shared form fields
  lib/auth/                 session, roles, visibility
  lib/data/                 server-only read models (scope.ts and one per area)
  lib/*.ts                  pure rules shared by server and client
  lib/ai/                   AI engine (planned; see AI layer)
  tests/                    integration suites and support
packages/db
  src/models.ts             Zod schemas → TypeScript types
  src/client.ts             one MongoClient per process, typed collections
  src/indexes.ts            index definitions
  src/fixtures.ts           fictional demo data for seed and tests
  src/time.ts               tenant-calendar helpers
  scripts/                  seed, indexes, inspect
.github/workflows/ci.yml    CI
```

## Quality attributes

| Attribute | How it is met |
| --- | --- |
| Correct access | One scope function for every query; writes re-check scope in a transaction; AI facts come only from scoped fact sources |
| Traceability | Audit row for every write; AI usage log for every model call (planned) |
| Speed | Static shell streams first; per-user data streams behind Suspense; indexed queries; AI outputs cached until their facts change |
| Privacy | Participant fence on captured content; redaction before AI; no content in logs; no secrets in git |
| Evolvability | Zod models in one package; AI capabilities as one-file definitions on one engine; decision records for every significant choice |
| Quality gate | CI on every push; AI evaluation set on every prompt or model change |
