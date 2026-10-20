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
| Contracts | `/contracts` | Built (read-only until the sync; editing later) |
| Contacts | `/contacts` | Built (sync to the warehouse and email backfill wait for those features) |
| Tasks | `/tasks` | Built (Wren suggestions wait for the AI layer) |
| Call cycle and visits | `/call-cycle` | Built (calendar sync waits for Microsoft 365) |
| Notifications | `/notifications` | Built (preferences and digests later) |
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
- **Built:** contacts and contracts cards (see those features).
- **Waiting on other features:** monthly sales, orders and stock (warehouse
  sync), Wren's account
  summary (AI layer), captured email and meetings on the timeline (capture).

### Contracts — Built
Contract headers from the customer's systems, soonest renewal first.
- **Built — renewal bands** worked out from each end date on the tenant's
  calendar: ended (last 90 days), within 30 days, 31–60, 61–90, later. Cards on
  top count the urgent bands and filter by them.
- **Built — list:** search by contract name, number or account; filter by band
  or account; sort by soonest end or largest value; owner column for managers;
  25 per page. Respects tenant, visibility and the division lens.
- **Built — profile card:** a bill-to's contracts with their renewal badge (a
  sold-to shows its bill-to's), linking to the filtered list.
- **Read-only:** contracts are Mirror data; the warehouse sync will keep them
  current. Terminated contracts and ones that ended over 90 days ago are hidden.
- **Next:** renewal tasks and notifications from the bands; create and edit
  contracts in Ambient with document upload.

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

### Call cycle and visits — Built
Plan the coming weeks of site visits, calls and meetings, then capture how each
one went.
- **Built — the next six weeks** from this Monday, as a list (one card per week)
  or a week grid with previous/next; today is highlighted. Weeks and days follow
  the tenant's calendar.
- **Built — needs closing:** planned visits from earlier weeks, so nothing is
  left open; this week's past visits show as overdue in place.
- **Built — history:** the last four weeks, collapsible.
- **Built — plan, reschedule, cancel:** a visit is on a bill-to, at a date and
  time (today or later), with a type and purpose. Managers can book a rep in
  their scope, who gets a notification; reps book themselves. Cancelling takes
  an optional reason. Also from the customer profile's Next touchpoint card and
  the dashboard's quick add.
- **Built — post-visit report:** completing a visit (on or after its day) takes
  a sentiment, relationship, commercial and service ratings (1–5), key points
  and follow-ups. Completed visits without a report can have one added. The
  account timeline shows the sentiment.
- **Built — rep filter** for managers; respects tenant, visibility and the
  division lens.
- **Privacy:** the audit log keeps scores and dates, never key points or
  follow-up text.
- **Next:** Outlook calendar sync; turn follow-ups into tasks; scorecard
  rollups for managers (team overview).

### Notifications — Built
Everything that needs the user's attention, in one history.
- **Built:** the signed-in user's own notifications, newest first, grouped by
  day on the tenant's calendar (Today, Yesterday, then the date); filter by
  unread and by type (only types the user has); 50 per page.
- **Built:** mark one read, or mark all read; the sidebar and bell counts
  update. Unread items are highlighted.
- **Built:** a notification links its account only while that account is in
  the user's scope, so links never lead to "not found".
- **Sources today:** task assignments, visit bookings, and seeded at-risk,
  renewal, Wren and reminder notices. AI and sync jobs will add more.
- **Next:** notification preferences and email digests.

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
Built step by step on one AI engine with OpenAI
([AI layer](../architecture/ai.md), [prompts](../architecture/ai-prompts.md)).
**Built so far (steps 1 to 3):** the engine (gates per tenant, feature and
role; monthly token budgets; rate limits; verified output; a usage log), fact
sources and cards, and the first feature:
- **Account summary** (built): "Generate" on the customer profile's Wren
  summary card writes a short briefing under Status, Needs attention and
  Recent activity, with one next step, what's not on record (worked out from
  the records, not by the AI) and the records it used as cards. It's kept for
  you until the account's records change (7 days at most); Refresh writes a
  new one. Works once the OpenAI key is set.

Planned:
- **Morning brief** (step 4): see below.
- **Chat** (step 5): side panel and full page; answers questions about the
  user's own tasks, accounts, visits, renewals and contacts. Answers are checked
  before they're shown, with the records as cards. Conversations are kept per
  user.
- **Proposals** (step 6): Wren proposes a task, a note or a visit; nothing
  changes until the user accepts, through the same action as the normal form.
  After a post-visit report, suggested follow-up tasks to accept or dismiss.
- **Later:** natural-language filters, meeting prep, next best action; with
  capture, analysed email on the timeline and search by meaning.
- **Controls:** off by default per tenant; an admin turns it on, picks the
  roles and features; monthly token budget and per-user rate limit; thumbs up or
  down on every answer.
- Until the OpenAI key is configured, these features show "AI isn't set up yet".

### Search
Quick search across accounts and contacts (built in the Ctrl K palette for
accounts) and semantic search over email and meeting analyses.

### Morning brief
Planned (AI step 4): a short cited digest of what needs attention today:
overdue and due tasks, today's visits, renewals within 30 days, unread alerts,
accounts that have gone quiet. Prepared at 7am in the tenant's zone.

### Manager surface
Team overview (per-rep performance vs budget and trend), report library with
deep links into BI, and CRM usage KPIs. Scoped to the manager's reporting tree.

### Admin
Sync health per dataset, audit log browser, and view-as for super admins
(time-limited, audited, excluded from production builds unless gated).
