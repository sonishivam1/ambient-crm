# Roadmap

Ambient is built in phases. Each phase ends at a gate that must pass before the
next phase depends on it. Dates are planning estimates for two developers
working with AI assistance, not commitments.

**This file is updated with every feature**, together with
[features.md](features.md) and the README progress table.

_Last updated: 19 Oct 2026 (contacts)._

## Where we are

We are building the core CRM screens first, on fictional demo data in Atlas,
so the product can be seen and tested end to end. Real sign-in and hosting
(Phase 0) and the warehouse sync (Phase 1) follow once the screens settle. The
data model and every query are already tenant-scoped and permission-checked,
so nothing built so far depends on demo-only shortcuts except development
sign-in.

| Status | Item | Phase |
| --- | --- | --- |
| ✅ Done | App shell, design system (navy and coral, light and dark), Ctrl K search | 0 |
| ✅ Done | Multi-tenancy: `tenantId` on every document, index and query ([ADR 0004](../architecture/decisions/0004-multi-tenancy.md)) | 0 |
| ✅ Done | Role visibility (own book, reports, reporting tree, all) and division lens | 1 |
| ✅ Done | Dashboard | 2 |
| ✅ Done | Accounts list with drill-down; customer profile; customer group page | 2 |
| ✅ Done | Tasks: today and all views, create, edit, assign, cancel | 2 |
| ✅ Done | Logged interactions (notes, calls, meetings) on the account timeline | 2 |
| ✅ Done | Automated tests: unit + integration on throwaway Atlas databases | – |
| ✅ Done | Tenant settings: each tenant's own divisions and lenses, and its time zone for "today", "overdue" and due dates | 1 |
| ✅ Done | Contacts: directory, add, edit, deactivate, profile card, Ctrl K search | 2 |
| ⏭ Next | Call cycle: plan visits, reschedule, complete with a post-visit report | 2 |
| ⏭ Next | Notifications page: history, mark read | 2 |
| ⏭ Next | Contracts list with renewal bands | 2 |
| Later | Sign-in (Entra ID), hosting, CI/CD ([ADR 0005](../architecture/decisions/0005-hosting-and-sign-in.md), proposed) | 0 |
| Later | Warehouse / ERP sync into the mirror collections | 1 |
| Later | Passive capture, review queue, Outlook add-in | 3 |
| Later | AI layer and Wren ([ADR 0006](../architecture/decisions/0006-ai-provider.md), proposed) | 4 |
| Later | Team overview, reports, CRM usage, admin tools | 5 |
| Later | Hardening, security review, pilot | 6 |

## Timeline

```mermaid
gantt
  title Ambient v1
  dateFormat YYYY-MM-DD
  axisFormat %d %b
  section Built
  Shell, design system, dashboard          :done,   b1, 2026-10-18, 1d
  Tenancy, accounts, profile, tasks, tests :done,   b2, 2026-10-19, 1d
  Tenant settings (divisions, time zone)   :done,   b3, 2026-10-19, 1d
  Contacts                                 :done,   b4, 2026-10-19, 1d
  section Core CRM
  Call cycle                               :active, c1, 2026-10-20, 6d
  Notifications, contracts                 :        c2, after c1, 4d
  section Foundations
  Sign-in, hosting, CI/CD                  :        f1, after c2, 7d
  section Data spine
  Warehouse sync with guardrails           :        d1, after f1, 12d
  section Passive capture
  Email and meeting workers, matcher       :        p1, after d1, 10d
  Review queue, Outlook add-in, backfill   :        p2, after p1, 5d
  section AI layer
  Analysis, embeddings, semantic search    :        a1, after p2, 8d
  Wren, morning brief, smart tasks         :        a2, after a1, 7d
  section Manager and admin
  Team, reports, usage, admin tools        :        m1, after a2, 10d
  section Launch
  Hardening, security review, pilot        :        l1, after m1, 15d
```

## Phases and gates

| Phase | Scope | Gate to pass |
| --- | --- | --- |
| 0 Foundations | Shell and design system (**done**), multi-tenancy (**done**), sign-in, CI/CD, hosting | A user signs in to their tenant in a deployed environment |
| 1 Data spine | Data model (**done** for current features), visibility rules (**done**), tenant settings (**done**), ERP/warehouse sync with guardrails | Each role sees exactly the right accounts on real-shaped data |
| 2 Core CRM | Dashboard, accounts, profile, group page, tasks, contacts (**done**); call cycle, notifications, contracts | Product demo sign-off on every core page |
| 3 Passive capture | Email and meeting workers, matcher, review queue, backfill, Outlook add-in | Test mailboxes captured end to end with no manual step |
| 4 AI layer | Redaction, analysis, embeddings, semantic search, Wren, morning brief, smart tasks | AI outputs reviewed on real test mail; cost per user within budget |
| 5 Manager and admin | Team overview, reports, CRM usage, sync health, audit, view-as | Manager and admin acceptance testing |
| 6 Launch | Security review, load test, monitoring, pilot customer, onboarding | Go-live approval for the pilot tenant |

## Decisions waiting on you

| Decision | Needed before |
| --- | --- |
| Hosting and sign-in ([ADR 0005](../architecture/decisions/0005-hosting-and-sign-in.md)) | Phase 0 sign-in work |
| AI provider ([ADR 0006](../architecture/decisions/0006-ai-provider.md)) | Phase 4 |

## After v1

Ideas parked until v1 is live, roughly in priority order:

1. Google Workspace capture alongside Microsoft 365.
2. Notification preferences and digest emails.
3. Configurable health scoring per tenant.
4. Mobile-first visit capture (voice notes to post-visit reports).
5. Self-serve onboarding and billing.
