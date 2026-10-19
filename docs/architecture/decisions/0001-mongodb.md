# 0001 — MongoDB Atlas as the primary datastore

**Status:** Accepted (18 Oct 2026)

## Context

Ambient stores three very different kinds of data: mirrored records from
customer systems whose shape varies by customer, app-native records that change
quickly, and AI output (summaries, follow-ups, embeddings) that is naturally
document-shaped. It also needs semantic search over embeddings and full-text
search over names.

## Decision

Use MongoDB, hosted on MongoDB Atlas, for operational data, the vector index
(Atlas Vector Search) and text search (Atlas Search). Locally, the
`mongodb-atlas-local` Docker image gives the same features, including a replica
set for transactions.

## Consequences

- One store for documents, vectors and search: fewer moving parts.
- Flexible mirror shapes per customer without migrations; Zod schemas keep the
  application honest about shape.
- Multi-document transactions are available (replica set) and are used for
  "write + audit row" pairs.
- Relational queries need care: hierarchy walks use `$graphLookup`; hot filters
  are denormalised (for example `division` on tasks and visits) and must be kept
  in step by the sync job.
- No database-enforced foreign keys: integrity is the application's job, so
  writes go through server actions that validate references.
