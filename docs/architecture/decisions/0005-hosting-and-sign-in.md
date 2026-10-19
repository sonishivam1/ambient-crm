# 0005 — Hosting on Vercel + Atlas; sign-in with Microsoft Entra ID

**Status:** Proposed — needs a decision before Phase 0 completes

## Context

Ambient needs a host for the Next.js app, somewhere to run scheduled workers
(capture, analysis, sync), and sign-in. Its customers already run on
Microsoft 365, because passive capture reads Exchange and Teams.

## Options for hosting

| Option | Web app | Workers | Notes |
| --- | --- | --- | --- |
| **A. Vercel + Atlas** (proposed) | Vercel (native Next.js, preview deploys per PR) | A background-job service (for example Inngest or Trigger.dev) or a small container host | Fastest to ship; low ops |
| B. Azure | App Service or Container Apps | Azure Functions / Container Apps Jobs | Close to Microsoft 365 customers' procurement; more setup |
| C. Single container host | Fly.io, Railway or similar | Same host, separate processes | Cheapest; more DIY for previews and scaling |

## Options for sign-in

| Option | Notes |
| --- | --- |
| **Microsoft Entra ID, multi-tenant app** (proposed) | Matches the Microsoft 365 requirement for capture; one consent covers sign-in and Graph |
| Auth service (for example Clerk, WorkOS) | Adds Google and SSO for non-Microsoft customers; another vendor |

## Proposal

- **Vercel** for the web app, **MongoDB Atlas** in the same region, and a managed
  job runner for workers.
- **Entra ID multi-tenant** sign-in through Auth.js; users are provisioned by a
  tenant admin and matched by object id. Development sign-in stays for local work
  only.
- Secrets in the host's encrypted environment settings; never in git.

## Consequences

- Preview deployments per pull request from day one.
- Worker runtime limits (duration, memory) shape how capture batches are sized.
- Adding Google Workspace later means a second identity provider and capture
  adapter.
