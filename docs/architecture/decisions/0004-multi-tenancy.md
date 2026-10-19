# 0004 — Multi-tenancy by `tenantId` on every document

**Status:** Accepted (19 Oct 2026) — option A, implemented

## Context

Ambient is a product for many customer organisations. The current code assumes
one organisation. Retrofitting tenancy after data exists is expensive and risky,
so the choice has to be made before the data spine is built.

## Options

| Option | Isolation | Cost | Operations |
| --- | --- | --- | --- |
| **A. Shared database, `tenantId` field** (proposed) | Logical; enforced in `getScope()` and indexes | Lowest | One schema, one set of indexes, easy analytics |
| B. Database per tenant | Stronger; one database per customer in the same cluster | Medium | Index and migration fan-out; connection per tenant |
| C. Cluster per tenant | Strongest; regional residency per customer | Highest | Many clusters to run; only for large customers |

## Proposal

Start with **A**, built so that **B or C** is possible for a customer who needs
it:

- Every document gets `tenantId`; every index starts with `tenantId`.
- `getScope()` adds `tenantId` to every filter. No query may bypass it (lint rule
  and tests).
- Users belong to exactly one tenant; the Entra tenant id maps to an Ambient
  tenant at sign-in.
- The connection is resolved per tenant through one function, so moving a tenant
  to its own database later is a configuration change.

## As built

- `tenants` collection: name, IANA time zone, Entra tenant id (for sign-in mapping), active flag.
- Every other document has `tenantId`; every index starts with it. Unique keys are
  unique per tenant (`tenantId + code`, `tenantId + email`) except values that are
  globally unique (Entra object id).
- Mirror records use `_id = "<tenantId>:<sourceKey>"` and keep `sourceKey`, so two
  customers' ERP keys can't collide and sync upserts stay deterministic.
  App-created records use UUIDs.
- `getScope()` exposes `tenant()` (tenant only) and `filter()` (tenant + rep scope +
  division lens). Rep hierarchy walks (`$graphLookup`) are restricted to the tenant.
- Audit rows carry `tenantId`.
- The seed creates two tenants, and the second reuses the first one's `CO-ACME`
  key and account codes on purpose; verified that each tenant's users see only
  their own data.

## Consequences

- One extra field and index prefix everywhere; small storage cost.
- A missed `tenantId` would leak data across customers, so the scope function is
  the only way to query, enforced in review and tests.
