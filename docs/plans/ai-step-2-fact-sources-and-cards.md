# AI step 2: fact sources and cards

**Status:** Agreed
**Agreed:** 20 Oct 2026

## Goal
Build the two shared pieces every AI feature stands on: **fact sources**, which
decide exactly what the AI may see, and **cards**, which show the user the real
records behind an answer. Nothing user-facing except a preview on
`/dev/components`. Design: [AI layer](../architecture/ai.md).

## Scope

### Fact sources (`lib/ai/facts/`)
Each reuses the read models the pages already use, so it can't see more than
the user can.

| Fact source | Used by | Built from | Contents (allowed fields only) |
| --- | --- | --- | --- |
| `accountFacts(accountId)` | Account summary (step 3), Wren `get_account` (step 5) | `getAccountProfile()` | **A1** account: name, type, segment, division, health, owner, FY revenue, last touch, group · **T** up to 10 open and recent tasks: title, status, due, overdue, priority · **V** next 3 planned and last 3 completed visits, with sentiment and ratings · **I** last 5 interactions · **K** contracts: name, value, end, days left, band · **C** up to 8 active contacts: name, title, roles |
| `myDayFacts()` | Morning brief (step 4) | `getTodayTasks()`, `getContractsPage()`, `getNotifications()`, call cycle queries | Overdue and due-today tasks, today's visits, renewals within 30 days, unread alerts, accounts with no contact in 30 days; each capped |

Built into every fact source: handles from a shared builder that also records
which real record each handle stands for (server-side only); explicit allowed
fields; ready-made values (tenant-zone dates, formatted money, days left,
bands); staff-written text fenced and cut; size caps; a fingerprint of the
facts for step 3's cache; out-of-scope or other-tenant accounts are not found.

### Cards (`components/ai/cards/`)
Card data comes from the same scoped records, kept by the facts builder for
every handle. A verified answer citing `T1` and `K1` returns those two cards.

| Card | Shows | Links to |
| --- | --- | --- |
| Account | Name, type, health, owner, FY revenue | Profile |
| Task | Title, due (red if overdue), priority, status | Tasks |
| Visit | Date and time, type, purpose, status or sentiment | Call cycle |
| Contract | Name, value, end, renewal badge | Contracts |
| Contact | Name, title, roles | Contacts |
| Interaction | Type, date, short summary | Profile timeline |

Previewed on `/dev/components`.

### Engine change
`runAiFeature` returns `cards` (the cited records, in order) and gains a
`not_found` failure reason.

Not in scope: the account summary itself and caching (step 3).

## Decisions
- **Staff-written text** (interaction summaries, report key points): included,
  fenced as untrusted and cut to 300 characters. Summaries are much better
  with it.
- **Contacts:** names, titles and roles only; never email or phone.
- **A manager's "my day":** the team's items, matching the dashboard.

## Tests
- Account facts for a rep: their account's tasks, visits, contracts and
  contacts appear; no email, phone or internal id anywhere; staff text fenced
  and cut.
- A sold-to gets its bill-to's contracts; another rep's or tenant's account is
  not found.
- My day: a rep sees only their own items, a manager the team's; dates in the
  tenant's zone (Harbor in Auckland).
- Caps hold on the busiest seeded account.
- The engine returns cards for cited handles only, in order, with the right
  links.
- Unit: handle builder, field allow-lists, fingerprint.

## Docs to update
AI layer (status, code layout), server API, testing, roadmap, build log,
CLAUDE.md.

## As built
_To be filled in when built._
