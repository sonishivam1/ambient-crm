# 0006 — Claude through the AI SDK; embeddings in Atlas Vector Search

**Status:** Proposed — needs a decision before Phase 4 (AI layer)

## Context

Ambient uses models for structured analysis of email and transcripts, a
tool-using chat assistant, short generated briefs, and embeddings for semantic
search. Customers will ask where their data goes and what it costs.

## Proposal

- All model calls go through the **Vercel AI SDK**, so the provider is
  configuration, not code.
- **Anthropic Claude** as the default provider:
  - `claude-sonnet-5-5` for analysis, Cara and account summaries;
  - `claude-haiku-5-5` for high-volume, simple steps (classification, short briefs).
- **Embeddings** from a dedicated embedding model (for example Voyage AI), stored
  in **Atlas Vector Search** next to the analysis they describe.
- Every call is logged to `aiInvocations` (model, prompt version, tokens,
  latency, status) for cost and quality tracking per tenant.

## Consequences

- Switching or mixing providers per tenant (for data-residency or price) needs no
  code change.
- Embedding dimension is fixed per index; changing the embedding model means a
  re-embed job.
- Model cost scales with captured volume, so analysis is queued, batched and
  budgeted per tenant.
