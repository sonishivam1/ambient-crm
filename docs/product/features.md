# Feature inventory

The full scope of Ambient v1, area by area. **Status** is what exists in the
code today: Built, Placeholder (route and page exist, feature does not), or
Planned (nothing yet).

## Summary

| Area | Route | Status |
| --- | --- | --- |
| App shell, navigation, Ctrl K search | all | Built |
| Light and dark mode | all | Built |
| Tenant settings (divisions, lenses, time zone) | all | Built (admin editing screen next) |
| Dashboard | `/` | Built |
| Accounts list (groups, bill-to, sold-to) | `/accounts` | Built |
| Customer group page | `/accounts/group/[key]` | Built (period figures wait for sync) |
| Customer profile | `/accounts/[id]` | Built (overview, tasks; sales, orders, stock wait for sync) |
| Contracts | `/contracts` | Placeholder |
| Contacts | `/contacts` | Built (sync to the warehouse and email backfill wait for those features) |
| Tasks | `/tasks` | Built (Wren suggestions wait for the AI layer) |
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

### Tenant settings — Built
Each tenant has its own divisions (for example Trade and Institutional), its own
division lenses (a lens can group several divisions), and its own time zone.
- **Built:** the top-bar lens shows "All" plus the tenant's lenses (hidden when
  it has none); division filters and labels on every page come from the tenant;
  a lens or division from another tenant is ignored, never widened to.
- **Built:** "today", "overdue", the week calendar, the greeting, due dates and
  every displayed date follow the tenant's time zone, whatever the server's or
  the browser's zone.
- **Next:** an admin screen to edit divisions, lenses and the time zone (today
  they are set in the tenant record).

### Accounts and customer groups — list Built
Accounts roll up into customer groups at three levels (conglomerate,
corporation, standalone), each with bill-to and sold-to accounts.
- **Built:** three views (group, bill-to, sold-to); stats strip (count, FY
  revenue, health mix); filters for division and health; search by name or code;
  sort by name, FY revenue or open tasks; 25 per page; group rows expand to
  bill-tos and bill-tos to sold-tos in place; owner and hierarchy columns for
  managers. All state is in the URL, so views are shareable. Respects tenant,
  visibility and the division lens.
- **Built — group page:** header with level, division, owner and FY revenue;
  bill-to and sold-to counts; health mix across every account in the group;
  open and overdue tasks across the group; bill-to table that expands to
  sold-tos; recent activity logged on any account in the group; group details.
  Out-of-scope or other-tenant groups show "not found".
- **Planned:** month and year to date figures and open orders for the group
  (warehouse sync).

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

### Contacts — Built
Ambient is the system of record for contacts: the people the team deals with at
each customer.
- **Built — directory:** search by name, email, job title or account; filter by
  account, the tenant's role tags and status (active by default, inactive, all);
  25 per page, sorted by last name; all state in the URL. Respects tenant,
  visibility and the division lens.
- **Built — add and edit:** a contact belongs to a bill-to and optionally one of
  its sites; first and last name, job title, email, phone and role tags. Emails
  are unique per tenant. Contacts can move to another bill-to the user can see.
- **Built — deactivate and reactivate** with a confirmation; inactive contacts
  stay on history but leave pickers and the profile card.
- **Built — profile card:** a bill-to shows its active contacts; a sold-to shows
  the ones at that site plus the account-wide ones; add a contact from there.
- **Built — Ctrl K search** finds active contacts in scope by name or email.
- **Privacy:** the audit log records where a contact sits and which fields
  changed, never their name, email or phone.
- **Next:** sync contacts back to the warehouse; offer to backfill past email
  when a contact is added or their email changes (with email capture).

### Tasks — Built
One list for manual tasks, manager-assigned tasks and Wren's suggestions.
- **Built:** Today view (overdue and due today) and All view; filters for
  status (including overdue), priority, source, division, account, assignee and
  due-date range; sort by due date, priority or created date; 20 per page. A
  create/edit dialog with an account search (or a locked account from a
  profile), title, due date, priority, description and notes. Managers can
  assign a task to several people at once (one task each), and each assignee
  gets a notification. A task can't be created already overdue. Edit, complete
  and cancel (with an optional reason) from the row menu. The dashboard's quick
  add opens the dialog. Every write is scoped and audited; description and notes
  text never reach the audit log.
- **Planned:** accepting or dismissing Wren's suggested tasks (needs capture and
  the AI layer); contact person on a task (needs Contacts).

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
