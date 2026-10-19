# Integrations

All integrations are **planned**. This document is the design they will be
built to.

## Email capture

A worker per tenant polls each in-scope mailbox through Microsoft Graph. Only
mail that involves a known customer address or domain is fetched in full.

```mermaid
sequenceDiagram
  autonumber
  participant T as Scheduler
  participant W as Email worker
  participant G as Microsoft Graph
  participant DB as MongoDB
  participant B as Blob storage
  participant Q as Job queue
  T->>W: every 5 minutes, per mailbox
  W->>DB: read mailbox cursor (delta token)
  W->>G: GET messages/delta (headers only)
  G-->>W: new and changed messages
  loop each message
    W->>DB: match From / To / Cc against contact emails, then customer domains
    alt confident match
      W->>G: GET full message body
      W->>B: store raw body
      W->>DB: insert message (snippet, blob pointer, accountId, participants)
      W->>Q: enqueue analysis
    else weak signal
      W->>DB: insert into review queue (headers only)
    else no customer involved
      W-->>W: skip — body never fetched
    end
  end
  W->>DB: advance cursor only after the whole batch succeeds
```

Rules:
- The cursor advances only on success, so a failure re-scans rather than skips.
- Mailbox access is limited by an Exchange application access policy to the
  tenant's licensed users.
- Thread grouping uses Graph's `conversationId`.
- Backfill: adding a contact (or changing their email) can queue a one-off
  historical search for that address.

## Meeting capture

Same pattern every 30 minutes over calendars. Meetings with an external customer
attendee are recorded; once a Teams meeting ends, its transcript is fetched
(with a grace period for late transcripts) and queued for analysis.

## Warehouse and ERP sync

Mirror and rollup data comes from the customer's systems; app-native data goes
back so the customer's BI sees CRM activity.

```mermaid
flowchart LR
  subgraph src["Customer systems"]
    erp["ERP / data warehouse<br/>export views"]
    landing["Landing area<br/>for CRM data"]
  end
  subgraph job["Nightly sync job"]
    pull["1 Pull mirrors<br/>reps, groups, accounts, contracts"]
    roll["2 Pull rollups<br/>sales, orders, stock"]
    score["3 Compute health<br/>in Ambient"]
    push["4 Push app-native<br/>tasks, visits, contacts, activity"]
  end
  db[("MongoDB")]
  hr["Entra ID<br/>manager hierarchy"]

  erp --> pull --> db
  erp --> roll --> db
  db --> score --> db
  db --> push --> landing
  hr --> pull
```

Guardrails:
- Each dataset is one `syncRuns` row with counts and status; *aborted* (a guard
  tripped) is separate from *failed* (an error).
- A dataset that would deactivate more than a set share of its rows aborts
  instead of applying (protects against a broken export).
- Mirrors are upserted by source key; rows missing from the source are
  deactivated, never deleted.
- Connectors are per tenant behind one interface, so a new source system is a
  new adapter, not a new job.

## Outlook add-in

```mermaid
sequenceDiagram
  participant O as Outlook
  participant A as Add-in task pane
  participant API as Ambient /api/addin
  participant DB as MongoDB
  O->>A: user opens "Send to Ambient"
  A->>O: getAccessToken() (Office SSO)
  A->>API: POST message id + token
  API->>API: validate token: signature, audience, issuer, expiry, scope
  API->>DB: find user by Entra object id (401 if unknown)
  API->>DB: match or create contact, file message, audit
  API-->>A: filed on account X
```

The add-in API is the only route outside normal web sign-in; CORS allows only
the add-in's own origin.

## BI

Reports are deep links into the customer's BI tool, not embedded. The report
library stores titles, descriptions and URLs per tenant.
