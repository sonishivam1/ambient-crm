# Feature inventory

The full scope of Ambient v1, area by area. **Status** is what exists in the
code today: Built, Placeholder (route and page exist, feature does not), or
Planned (nothing yet).

## Summary

| Area | Route | Status |
| --- | --- | --- |
| App shell, navigation, Ctrl K search | all | Built |
| Light and dark mode | all | Built |
| Dashboard | `/` | Built |
| Accounts list (groups, bill-to, sold-to) | `/accounts` | Built |
| Customer group page | `/accounts/group/[key]` | Placeholder |
| Customer profile | `/accounts/[id]` | Built (overview, tasks; sales, orders, stock wait for sync) |
| Contracts | `/contracts` | Placeholder |
| Contacts | `/contacts` | Placeholder |
| Tasks, smart tasks, next actions | `/tasks` | Placeholder (completion from dashboard is built) |
| Call cycle and visits | `/call-cycle` | Placeholder |
| Notifications | `/notifications` | Placeholder |
| Email and meeting capture | background workers | Planned |
| Review queue | `/review-queue` | Placeholder |
| Outlook add-in | Outlook task pane | Planned |
| Wren assistant | `/assistant`, side panel | Placeholder |
| Search (quick and semantic) | `/search` | Placeholder |
| Morning brief | `/morning-brief` | Placeholder |
| Team overview, reports, CRM usage | `/team`, `/reports`, `/crm-usage` | Placeholder |
| Admin: sync health, audit, view-as | `/admin/*` | Placeholder |
| In-app help | `/how-it-works/*` | Placeholder |

## Areas

### Dashboard — Built
Action-led home page. Greeting and quick links; KPIs (month-to-date sales vs
target, year-to-date gross margin, customer health mix, open tasks); a "do
first" strip (overdue tasks, groups at risk, visits left this week);
notifications; a week calendar of visits; today's tasks with one-click
completion; portfolio health ring; next visit; sales vs target with top
accounts; at-risk accounts. Every number respects the user's visibility and the
division lens, and rollups show their "as of" date.

### Accounts and customer groups — list Built
Accounts roll up into customer groups at three levels (conglomerate,
corporation, standalone), each with bill-to and sold-to accounts.
- **Built:** three views (group, bill-to, sold-to); stats strip (count, FY
  revenue, health mix); filters for division and health; search by name or code;
  sort by name, FY revenue or open tasks; 25 per page; group rows expand to
  bill-tos and bill-tos to sold-tos in place; owner and hierarchy columns for
  managers. All state is in the URL, so views are shareable. Respects tenant,
  visibility and the division lens.
- **Planned:** the customer group page (roll-up of revenue and health, full
  bill-to list).

### Customer profile — Built
One page per account with tabs: overview, tasks, sales, health, open orders and
stock.
- **Built:** hero band (health, owner, group, FY revenue, open and overdue
  tasks, next visit, last touch); **Log interaction** (note, call or meeting,
  written with an audit row that never stores the text); a timeline of logged
  interactions, completed visits and completed tasks, filterable by type; next
  touchpoint, details and related accounts (sold-tos of a bill-to, or the
  parent and siblings of a sold-to); a tasks tab with one-click completion.
  Accounts outside the user's scope or tenant show "not found".
- **Waiting on other features:** monthly sales, orders and stock (warehouse
  sync), contacts and contracts cards (their own features), Wren's account
  summary (AI layer), captured email and meetings on the timeline (capture).

### Contracts
List with renewal bands (≤30, ≤60, ≤90 days) linked to accounts. Later:
create and edit contracts in Ambient with document upload.

### Contacts
Ambient is the system of record for contacts. Search and filter by role,
account and status; create and edit; sync back to the warehouse. Adding a
contact (or changing their email) offers to backfill past email with them.

### Tasks
One list for manual tasks, AI smart tasks and next actions.
- Today, upcoming and all views; filters by status, priority, source, assignee.
- Create, edit, complete; managers assign tasks to their reports.
- Accept or dismiss AI suggestions with one click.

### Call cycle and visits
Plan the week as a list or week grid; add, reschedule and cancel site visits,
calls and meetings; complete a visit with a short post-visit report.

### Email and meeting capture
Background workers read in-scope mailboxes and calendars through Microsoft
Graph. Mail with no customer on it is never fetched. Matched mail is filed on
the account timeline; Teams meeting transcripts are captured once the meeting
ends. Unmatched mail with some signal goes to the review queue. See
[integrations](../architecture/integrations.md#email-capture).

### Review queue
Mail the matcher could not file confidently. Approve to file it (and teach the
matcher the new address) or reject.

### Outlook add-in
"Send to Ambient" on an email and "Add to Ambient" on a meeting, for the cases
passive capture misses. Creates contacts for unknown senders.

### Wren, the AI assistant
Side panel and full page. Streams answers with citations. Tools: create a
follow-up task, log a note, find similar emails, summarise an account, list
overdue follow-ups. Every tool re-checks visibility and records what it did.
Conversations are stored server-side. See [AI layer](../architecture/ai.md).

### Search
Quick search across accounts and contacts (built in the Ctrl K palette for
accounts) and semantic search over email and meeting analyses.

### Morning brief
A short generated digest: what changed overnight, what to do first, accounts
that have gone quiet.

### Manager surface
Team overview (per-rep performance vs budget and trend), report library with
deep links into BI, and CRM usage KPIs. Scoped to the manager's reporting tree.

### Admin
Sync health per dataset, audit log browser, and view-as for super admins
(time-limited, audited, excluded from production builds unless gated).
