# 0006: OpenAI through the AI SDK, on one AI engine

**Status:** Accepted (20 Oct 2026). Supersedes the earlier proposal of Anthropic
Claude as the default provider.

## Context

Ambient uses models for short grounded summaries, a tool-using assistant
(Wren), a morning brief and follow-up suggestions now, and analysis of captured
email and meetings plus semantic search later. The project has no AI budget
yet: the team will provide an OpenAI API key for the first demo. Security (no
data leakage, no action without permission) and hallucination control matter
more than raw model strength.

## Decision

- **Provider: OpenAI**, called only through the **Vercel AI SDK** from server
  code, so the provider stays a configuration detail rather than code.
- **Models: two tiers.** `fast` (a small, low-cost OpenAI model, `OPENAI_MODEL`) for
  every feature by default, and `strong` (`OPENAI_MODEL_STRONG`, optional). Ambient's
  grounding design (facts in, cited answers out, code checks after) does not
  need a large model. A feature moves to `strong` only if the
  evaluation set shows `fast` falls short there.
- **Key:** `OPENAI_API_KEY`, server-only, never logged, never `NEXT_PUBLIC_*`.
  For demos, a separate OpenAI project key with a monthly spending limit,
  revoked afterwards.
- **No free or local models.** Until the key arrives, AI features show
  "AI isn't set up yet" and the rest of the CRM works unchanged.
- **Test-only stand-in.** Automated tests and CI use a stub that implements the
  AI SDK's model interface and returns fixed replies. It is never used by the
  running app. It lets us prove the security rules (scope, citations, gates,
  budgets) without a key, and CI never calls OpenAI.
- **One engine, declared capabilities.** Every AI capability is a definition
  (feature, tool, fact source, card, trigger) run by one engine inside one
  safety layer (gates, scoped facts, verification, logging). Nothing outside
  `lib/ai/` calls OpenAI. Design: [AI layer](../ai.md).
- **Built in steps:** engine core, fact sources and cards, account summary,
  morning brief, Wren read-only chat, proposals with Confirm (and follow-up
  suggestions), evaluation and feedback. Email and meeting analysis and semantic
  search follow capture (Phase 3).
- **Prompts are versioned code** ([AI prompts](../ai-prompts.md)). Every call
  logs its prompt version; a prompt change must pass the evaluation set.
- **Embeddings** (later, with semantic search): an OpenAI embedding model,
  stored in Atlas Vector Search next to the analysis it describes, always
  filtered by `tenantId`.

## Consequences

- Real AI quality is only measured once the key arrives ("key day"): we run
  the evaluation set of fictional questions with known answers and tune prompts
  before trusting any feature.
- The demo runs on Ambient's fictional seed data, so no real customer data goes
  to OpenAI. Before real customer data is processed, the OpenAI data terms
  (API data not used for training, retention) are reviewed and a data
  processing agreement is in place.
- Model cost scales with use, so every call is gated by a per-tenant token
  budget and a per-user rate limit, and logged to `aiInvocations`.
- Changing provider later means a new AI SDK provider and a pass of the
  evaluation set, not a rewrite.
