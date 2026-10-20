# AI layer

**Status:** step 1 (engine core) built; the rest designed and built step by
step (see [Build order](#build-order)).
Provider: OpenAI through the Vercel AI SDK
([ADR 0006](decisions/0006-ai-provider.md)). Prompts: [AI prompts](ai-prompts.md).

Ambient's AI is a **platform inside the app**, not a set of hand-wired
features. Every AI capability is a small *definition* (a feature, a tool, a
fact source, a card, a trigger) and one **engine** runs every definition the
same way, inside the same safety layer. Adding a capability means adding a
file; no new capability can skip a safeguard, because none of them talks to the
model directly.

This page is the single source for the AI design and its rules. Other documents
link here rather than repeat it.

## Four guarantees

However many features we add, the engine enforces:

1. **The model never reaches the database.** It only sees facts our code built
   from scoped read models (`getScope()`): what the signed-in user may see,
   nothing else.
2. **Nothing changes without the user.** The model can only *propose*; the user
   confirms; the change runs through our existing server actions with their
   scope check and audit row.
3. **Facts on screen come from our records.** Tasks, visits, contracts and
   figures are shown as cards drawn from the database; the model's text only
   interprets them, and is checked before it is shown.
4. **Every call is gated, budgeted, logged and measurable.** Off by default per
   tenant; usage logged without content; quality measured with an evaluation set.

## Architecture

```mermaid
flowchart TB
  user(["Account manager<br/>or manager"])

  subgraph ui["Web app · UI"]
    direction LR
    surfaces["Surfaces<br/>profile summary · morning brief<br/>Wren chat · suggestions"]
    cards["Cards<br/>task · visit · contract<br/>account · contact · proposal"]
    confirm["Confirm / Cancel"]
  end

  subgraph defs["Definitions · one file each"]
    direction LR
    features["Features<br/>defineAiFeature"]
    tools["Tools<br/>defineAiTool"]
    triggers["Triggers<br/>domain events · schedules"]
  end

  subgraph engine["AI engine · lib/ai"]
    direction LR
    gates["Gates<br/>key · tenant policy · role<br/>budget · rate limit"]
    factsb["Facts<br/>scoped · handles · allowed fields<br/>untrusted text fenced"]
    prompt["Prompt<br/>policy + feature · versioned"]
    modelcall["Model call<br/>tier · time limit · abort"]
    verify["Verify<br/>schema · handles · limits"]
    keep["Save and log<br/>cache · aiInvocations · feedback"]
    gates --> factsb --> prompt --> modelcall --> verify --> keep
  end

  subgraph data["Ambient data"]
    direction LR
    sources["Fact sources<br/>account · my day · renewals"]
    readmodels["Read models<br/>getScope()"]
    actions["Server actions<br/>createTask · createVisit · logInteraction"]
    db[("MongoDB Atlas<br/>CRM data · aiInvocations<br/>aiOutputs · conversations")]
    sources --> readmodels --> db
    actions --> db
  end

  openai["OpenAI<br/>fast and strong tiers"]

  user --> surfaces
  surfaces --> features
  surfaces --> tools
  triggers --> features
  features --> gates
  tools --> gates
  factsb --> sources
  modelcall <--> openai
  keep --> db
  verify --> cards
  cards --> surfaces
  cards --> confirm
  confirm --> actions

  classDef person fill:#FDE7E1,stroke:#E8664A,stroke-width:2px,color:#1B2340;
  classDef uiNode fill:#DCE6FB,stroke:#2F4A8A,stroke-width:2px,color:#13203F;
  classDef defNode fill:#E4F4FB,stroke:#2B8CB8,stroke-width:2px,color:#0D2F3F;
  classDef engineNode fill:#EDE3FB,stroke:#7B4FD0,stroke-width:2px,color:#2A1450;
  classDef safety fill:#FFF3D6,stroke:#D49A1A,stroke-width:2px,color:#3D2A00;
  classDef dataNode fill:#DFF5EA,stroke:#2E9E6A,stroke-width:2px,color:#0F3B27;
  classDef external fill:#ECEFF3,stroke:#6B7685,stroke-width:2px,color:#1F2933;

  class user person;
  class surfaces,cards,confirm uiNode;
  class features,tools,triggers defNode;
  class prompt,modelcall,keep engineNode;
  class gates,factsb,verify safety;
  class sources,readmodels,actions,db dataNode;
  class openai external;

  style ui fill:#F3F6FD,stroke:#2F4A8A,stroke-width:2px,color:#13203F
  style defs fill:#F1F9FC,stroke:#2B8CB8,stroke-width:2px,color:#0D2F3F
  style engine fill:#F7F2FD,stroke:#7B4FD0,stroke-width:2px,color:#2A1450
  style data fill:#F0FAF5,stroke:#2E9E6A,stroke-width:2px,color:#0F3B27
```

Colour key: coral = people · navy = UI · teal = definitions · violet = engine ·
amber = safety steps · green = Ambient data · grey = external.

## Building blocks

| Block | What it is | Adding one means |
| --- | --- | --- |
| **Feature** | A one-shot AI job (account summary, morning brief, follow-up suggestions) | One `defineAiFeature` file |
| **Tool** | Something chat (and later, jobs) can use: a *read* tool returns facts and cards; a *propose* tool returns a proposal | One `defineAiTool` file |
| **Fact source** | A shared builder of scoped facts ("account", "my day", "renewals") with handles and an allowed-field list; reused by features and tools | One file |
| **Card** | UI for one kind of record (task, visit, contract, account, contact, proposal), rendered from database records, never from model text | One component |
| **Proposal** | A change the AI suggests, mapped to an **existing** server action, confirmed by the user, idempotent by proposal id | One mapping |
| **Trigger** | Runs a feature on a domain event or schedule (visit completed, contract enters the 30-day band, 7am brief in the tenant's zone) | One registration |
| **Model tier** | `fast` or `strong`, mapped to `OPENAI_MODEL` and `OPENAI_MODEL_STRONG` | A setting |
| **Tenant AI policy** | In the tenant record: on/off, allowed roles, enabled features, monthly token budget | A field |
| **Evaluation cases** | Fictional inputs with expected results per feature, run by `pnpm ai:eval` | One file |
| **Feedback** | Thumbs up/down on every answer; poor answers become evaluation cases | Built in |

### The contracts (sketch)

```ts
// A feature: the engine does gates, facts, call, verify, save and log.
export default defineAiFeature({
  id: "account-summary",
  version: 1,
  roles: ["user", "manager", "senior", "lead"],
  tier: "fast",
  input: z.object({ accountId: z.string() }),
  facts: accountFacts,                    // fact source: scoped, with handles
  prompt: accountSummaryPrompt,           // versioned module (ai-prompts.md)
  output: AccountSummarySchema,           // strict structured output
  cache: { until: "facts-change" },
});

// A tool: the engine re-checks scope, enforces the result contract, times and logs it.
export default defineAiTool({
  name: "list_tasks",
  kind: "read",                           // "read" | "propose"
  description: "The user's tasks. Use for to-dos, follow-ups, overdue or due work.",
  input: z.object({ status: z.enum(["overdue", "due_today", "open"]), accountName: z.string().optional() }),
  run: async (scope, input) => tasksFacts(scope, input),
});

// Every tool returns the same shape.
type ToolResult =
  | { ok: true; facts: Facts; cards: CardRef[] }       // cards render from records
  | { ok: false; reason: string; ask?: string };       // the model must not claim success
```

## One run, end to end

```mermaid
sequenceDiagram
  autonumber
  actor U as User
  participant S as Surface (page or chat)
  participant E as Engine
  participant F as Fact source
  participant DB as MongoDB
  participant M as OpenAI
  U->>S: Generate summary
  S->>E: runAiFeature("account-summary", { accountId })
  E->>E: gates: key, tenant policy, role, budget, rate limit
  E->>DB: cached output with the same facts fingerprint?
  alt cache hit
    DB-->>E: saved output
  else cache miss
    E->>F: build facts for this user
    F->>DB: scoped read models (getScope)
    DB-->>F: only what the user may see
    F-->>E: facts with handles, fenced text, allowed fields
    E->>M: policy + feature prompt + facts (tier, time limit)
    M-->>E: structured output citing handles
    E->>E: verify schema, handles, limits (one retry on bad shape)
    E->>DB: save output + aiInvocations row (no text)
  end
  E-->>S: verified output + card references
  S-->>U: text that interprets, cards that show the records
```

## Gates

Checked before any call; a refused gate never calls OpenAI and costs nothing.

| Gate | Rule |
| --- | --- |
| Configured | `OPENAI_API_KEY` and the feature's model tier are set; otherwise "AI isn't set up yet" |
| Tenant policy | `tenants.ai.enabled` is true and the feature is enabled; off by default |
| Role | The user's role is allowed by the feature and by the tenant |
| Budget | Estimated tokens are reserved against the tenant's monthly budget before the call and settled after |
| Rate limit | The user is under their per-minute and per-day limits |

## Facts

- Built only by **fact sources**, on the same read models the pages use, so a
  call can only contain what the user may see. Tests inspect exactly what would
  be sent.
- Every record gets a short **handle** (`A1` account, `T1` task, `V1` visit,
  `I1` interaction, `C1` contact, `K1` contract, `N1` notification); real ids
  never leave the server.
- Each fact source has an **allowed-field list**: a feature gets only the
  fields it needs. Values arrive ready to use (dates in the tenant's zone, money
  formatted, `daysLeft` computed).
- Customer- and staff-written text is wrapped in `<untrusted>`, with tag-like
  text stripped from inside it.
- **Redaction** (card, bank, tax and identity numbers, checked with checksums)
  applies to captured email and transcripts in the capture phase, before any of
  that text becomes a fact.

## Verification

1. **Shape:** the reply parses against the feature's schema (OpenAI strict
   structured outputs through `generateObject`). On failure, one retry with the
   error; then a graceful "Couldn't generate this right now".
2. **Handles:** every cited handle exists in *this* call's facts. A point or
   sentence citing anything else is removed.
3. **Cards carry the figures:** dates, values and counts the user acts on are
   shown on cards rendered from the cited records, so the model's text never has
   to be trusted for a number.
4. **Limits:** counts and lengths capped; markup stripped.

The user only ever sees verified output: **verify, then show**.

## Proposals

```mermaid
flowchart LR
  ask["User: “remind me to send<br/>the quote by Friday”"] --> tool["Propose tool<br/>validates input · ok:false + question if incomplete"]
  tool --> card["Proposal card<br/>Accept · Edit · Cancel"]
  card -->|Accept| action["Existing server action<br/>createTask · createVisit · logInteraction"]
  action --> checks["Scope check · validation<br/>audit row · one transaction"]
  checks --> done["Done · idempotent by proposal id"]
  card -->|Cancel| nothing["Nothing written"]

  classDef person fill:#FDE7E1,stroke:#E8664A,stroke-width:2px,color:#1B2340;
  classDef engineNode fill:#EDE3FB,stroke:#7B4FD0,stroke-width:2px,color:#2A1450;
  classDef uiNode fill:#DCE6FB,stroke:#2F4A8A,stroke-width:2px,color:#13203F;
  classDef safety fill:#FFF3D6,stroke:#D49A1A,stroke-width:2px,color:#3D2A00;
  classDef dataNode fill:#DFF5EA,stroke:#2E9E6A,stroke-width:2px,color:#0F3B27;
  classDef external fill:#ECEFF3,stroke:#6B7685,stroke-width:2px,color:#1F2933;
  class ask person;
  class tool engineNode;
  class card uiNode;
  class action,done dataNode;
  class checks safety;
  class nothing external;
```

A proposal carries what the user would type into the normal form; Accept runs
the **same** server action as that form, so every rule (scope, due dates,
assignment rights, audit) applies unchanged. A proposal id makes Accept safe to
click twice. There is no tool that sends email or messages.

## Wren chat

```mermaid
sequenceDiagram
  autonumber
  actor U as User
  participant W as Chat route
  participant E as Engine
  participant T as Tool
  participant DB as MongoDB
  participant M as OpenAI
  U->>W: "What's overdue on ACME?"
  W->>DB: load this user's conversation
  W->>E: gates
  W-->>U: progress: "Checking your tasks…"
  W->>M: policy + chat prompt + tool definitions
  M->>W: call list_tasks(status: overdue, accountName: "ACME")
  W->>T: run as the signed-in user (scope re-checked)
  T->>DB: scoped read model
  T-->>W: ok, facts with handles, cards
  W->>M: tool result
  M-->>W: structured answer citing handles
  W->>E: verify handles and shape
  W->>DB: save turn, aiInvocations row
  W-->>U: verified answer + task cards
```

- At most 4 tool calls per question; the closing of the tab aborts the call.
- Read tools first (step 5); propose tools with Confirm (step 6).
- Conversations are stored per user, kept for 90 days, never shared, and never
  sent anywhere except as context for that user's own next turn.

## Triggers, caching and reliability

- **Triggers** run a feature from a domain event or schedule through the same
  engine (visit completed → follow-up suggestions; contract enters the 30-day
  band → renewal nudge; 7am in the tenant's zone → morning brief). Results are
  stored for the user, never pushed to customers.
- **Caching:** outputs are saved in `aiOutputs` with a fingerprint of their
  facts; a page view reuses them until the facts change or the user refreshes.
- **Reliability:** 20-second time limit per call; one retry only for a bad
  shape; provider errors become friendly messages; a closed tab aborts the call
  so nobody pays for an unread answer.

## Security guarantees

| Threat | Control |
| --- | --- |
| The AI reveals data the user can't see | Facts only from scoped fact sources; handles verified against this call's facts; tests inspect what would be sent |
| Data from another tenant | Every fact source runs on `getScope()`; vector search (later) always filters by `tenantId` |
| The model is told to misbehave by text in an email or note | Customer text fenced as `<untrusted>`; tools re-check scope; nothing changes without the user's Confirm |
| The model invents an account id or a record | Tools re-authorise every id; name lookups search only the user's own accounts; invented handles are dropped |
| The AI writes data on its own | Propose tools only; Accept runs the existing server action; no send tools |
| A leaked or runaway key | Server-only key, never logged; per-tenant budget; per-user rate limit; demo key with a spending limit |
| Content in logs | `aiInvocations` holds metadata only, with a test that fails if content ever appears |

## Hallucination controls

- Facts and figures come from our queries and appear on cards; the model only
  interprets them.
- Every claim cites a handle; the engine verifies each one.
- Strict structured outputs with fixed values at low temperature.
- When the facts don't hold the answer, the model says so; it never guesses.
- Tools answer `ok: false` with a reason when something can't be done; the
  model must not claim success.
- An evaluation set and user feedback measure quality before and after release.

## Testing

| What | How | When |
| --- | --- | --- |
| Gates, scoped facts, handle checks, retries, budgets, caching, logging without content, proposals through existing actions | Integration tests with the **test-only stand-in** model (fixed replies) | Every step, in CI |
| Answer quality, citations, refusals, cost per call | `pnpm ai:eval` with the evaluation set against the real model | Key day, then on every prompt or model change |

The stand-in implements the AI SDK's model interface and is used only by
tests; the running app always calls OpenAI. CI never needs a key.

## Build order

Engine first, then features on it. Each step is built, documented and reviewed
before the next.

| Step | Builds | Status |
| --- | --- | --- |
| 1. Engine core | `defineAiFeature`, `runAiFeature`, OpenAI client and tiers, gates and tenant AI policy, `aiInvocations`, `aiUsage` budget ledger, test-only stand-in, security tests | ✅ Built |
| 2. Fact sources and cards | Account and "my day" fact sources with handles and allowed fields; account, task, visit, contract, contact, interaction and notification cards | ✅ Built |
| 3. Account summary | First feature on the engine, with caching, on the profile's Wren summary card | Next |
| 4. Morning brief | Second feature, plus the 7am trigger | Planned |
| 5. Wren chat (read-only) | `defineAiTool`, read tools, saved conversations, verified answers with cards | Planned |
| 6. Proposals | Propose tools, Confirm cards, existing actions, idempotent Accept; follow-up suggestions after visit reports | Planned |
| 7. Evaluation and feedback | `pnpm ai:eval`, thumbs up/down; run on key day | Planned |
| Later | Natural-language filters, meeting prep, next best action, report narratives; email and meeting analysis and semantic search after capture | — |

Deliberately **not** built: agents that act without a click, fine-tuned
models, anything that sends messages to customers.

## Code layout

```
apps/web/lib/ai/
  config.ts        OPENAI_* settings read on use, tiers, rate limits, time limit      (built)
  client.ts        the only file that imports @ai-sdk/openai: modelFor(tier)          (built)
  engine.ts        defineAiFeature, runAiFeature (defineAiTool in step 5)             (built)
  gates.ts         key, tenant policy, feature, role, rate limit, budget left         (built)
  budget.ts        aiUsage ledger: atomic reserve, settle, tokens left                (built)
  facts.ts         fact packets, factsBuilder, allowed fields, fencing, fingerprint   (built)
  cards.ts         card data types, safe in client components                         (built)
  verify.ts        drop claims citing handles not in this call's facts                (built)
  log.ts           aiInvocations rows, metadata only                                  (built)
  prompts/         versioned prompt modules; policy.ts is v1                          (built)
  facts/           fact sources on scoped read models: account, my-day               (built)
  features/        one file per feature                                               (step 3 on)
  tools/           one file per tool                                                  (step 5)
apps/web/components/ai/cards/    one card per record kind                            (built)
apps/web/components/ai/          proposal card, chat panel                           (step 5 on)
apps/web/tests/support/ai-stand-in.ts   the test-only stand-in model                (built)
```

Nothing outside `lib/ai/` imports the AI SDK or calls OpenAI. The stand-in lives
under `tests/` and is swapped in with `vi.mock("@/lib/ai/client")`, so app code
has no test hook.

## Engine details (built in step 1)

- **Settings:** `OPENAI_API_KEY`, `OPENAI_MODEL` (`fast`), `OPENAI_MODEL_STRONG`
  (`strong`, falls back to `fast`), read on every use; "AI isn't set up yet"
  until the key and `OPENAI_MODEL` are set.
- **Tenant policy:** `tenants.ai = { enabled, roles, features, monthlyTokenBudget }`,
  off by default. Demo data: on for Northwind (roles user, manager, senior,
  lead; 2,000,000 tokens a month), off for Harbor & Finch. Set in the seed for
  now; the admin screen comes in Phase 5.
- **Rate limits:** 10 requests a minute and 200 a day per user (rolling),
  counting only requests that reached the model.
- **Budget:** an estimate (prompt characters ÷ 4 + the feature's output cap) is
  reserved atomically in `aiUsage` before the call and settled to real usage
  after, including on failure. Concurrent calls can't reserve past the budget.
- **Call:** `generateText` with `Output.object` (OpenAI strict structured
  outputs), the feature's temperature and output cap, one SDK retry for network
  errors, a 20-second time limit. Output schemas must use `.nullable()`, not
  `.optional()` or `.default()`, for strict mode.
- **Retry:** one more attempt only when the reply's shape is wrong.
- **Result:** `{ ok: true, output, outcome, sources, cards }` or
  `{ ok: false, reason, message }`; reasons are the gate refusals plus
  `invalid_input`, `not_found` (step 2), `rejected` (every claim invented) and
  `failed`. Messages never include provider error text.

## Fact sources and cards (built in step 2)

- **Builder:** a fact source calls `factsBuilder().add(kind, fact, card)` for
  each record. It hands out the handle (`A1`, `T1`, `V1`, `K1`, `C1`, `I1`,
  `N1`), keeps only that kind's `ALLOWED_FIELDS`, and keeps the card on the
  server. `build(data)` returns the packet: data, handles, cards (only for
  handles in the data) and a SHA-256 fingerprint of the data.
- **Values arrive ready:** dates as "Tue 21 Oct 2026" on the tenant's
  calendar, money as on the pages ("$312K"), days left, band and health
  labels, ratings as "Relationship 4/5, …". `counts` give full totals.
- **Staff-written text** (task titles, visit purposes, report key points and
  follow-ups, interaction summaries, notification bodies) is fenced as
  `<untrusted>` and cut to 300 characters. Contacts carry names, titles and
  roles only: never email or phone. No real id is ever in the facts.
- **`accountFacts(scope, { accountId })`** on `getAccountProfile()`: the
  account; up to 10 tasks (open soonest first, then completed); 3 planned
  visits (oldest first, so an unclosed one shows) and the 3 latest completed,
  with scorecards; 5 latest interactions; up to 10 contracts (a sold-to gets
  its bill-to's); up to 8 active contacts. Null when the account is missing,
  inactive, out of scope or another tenant's: the engine answers `not_found`
  without calling the model.
- **`myDayFacts(scope)`**: overdue tasks and tasks due today, today's planned
  visits, renewals within 30 days, unread notifications (10 each), and up to 5
  quiet accounts (no interaction or completed visit in 30 days). A manager's
  is their team's, as on the dashboard; notifications are always the user's.
- **Cards** (`components/ai/cards/`): `<AiCards cards>` renders the records an
  answer cites, in citation order, each linking to where it lives (profile,
  tasks, call cycle, contracts, contacts, notifications). Card data is built
  from the same rows as the facts, never from model text.
