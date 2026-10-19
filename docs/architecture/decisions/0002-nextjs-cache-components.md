# 0002 — Next.js 16 with Cache Components; server actions for writes

**Status:** Accepted (18 Oct 2026)

## Context

Ambient is almost entirely per-user, signed-in UI with a streaming AI chat. We
want one codebase for UI and server logic, fast first paint, and no separate API
layer to keep in sync.

## Decision

- Next.js 16 App Router with **Cache Components** and Partial Prefetching on.
- The shell renders as a static frame; anything per user sits behind
  `getCurrentUser()`, which calls `connection()` so it is request-time only, and
  inside a Suspense boundary or `loading.tsx`.
- **Server actions** for every mutation; **route handlers** only where something
  outside the web app calls in (Outlook add-in, webhooks, chat streaming).
- Turbopack for dev and build.

## Consequences

- The shell paints before any database work; data streams in.
- Visibility is enforced in one place (`getScope()`), not per endpoint.
- Developers must respect the Cache Components rules: no `new Date()`, random
  values or uncached I/O before a request-time boundary. The MongoDB driver
  counts as uncached I/O, which is why `connection()` sits at the top of
  `getCurrentUser()`.
- Server actions are public HTTP endpoints: each must parse its input and check
  scope itself.
