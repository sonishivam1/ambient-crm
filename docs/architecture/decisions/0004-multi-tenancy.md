# 0004 — Multi-tenancy by `tenantId` on every document

**Status:** Proposed — needs a decision before Phase 1 (data spine)

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

## Consequences

- One extra field and index prefix everywhere; small storage cost.
- A missed `tenantId` would leak data across customers, so the scope function is
  the only way to query, enforced in review and tests.
