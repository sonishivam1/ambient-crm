# Changelog

What changed for people using Ambient. For how and why each change was built,
see the [build log](docs/engineering/build-log.md).

## Unreleased

### AI (in progress)
- AI engine foundations: AI is off by default per organisation, with chosen
  roles, a monthly allowance and per-person limits.
- **Account summary:** Generate on a customer profile writes a short briefing
  with one next step, what's not on record, and the records it used. It's
  kept until the account changes; Refresh writes a new one. Needs the OpenAI
  key, so it shows "AI isn't set up yet" until then.
- **Morning brief:** "Generate today's brief" on the Morning brief page lists
  up to six things that need you today, with their records, under a headline
  counted from your records. It's kept for the day and says when things have
  changed since; the dashboard tile shows the headline. Needs the OpenAI key.
- **Wren chat:** ask about your tasks, visits, renewals, contacts and accounts
  on the Assistant page. You see what Wren is checking, then a checked answer
  with the records it used; it asks when a name could mean several accounts.
  Conversations are kept for 90 days and can be deleted. Read-only for now.
  Needs the OpenAI key.

### Core CRM
- **Dashboard:** today's tasks, the week's visits, key figures, at-risk
  accounts and notifications.
- **Accounts:** customer groups, bill-tos and sold-tos with filters, search and
  drill-down; a profile per account and per group.
- **Tasks:** today and all views; create, edit, assign (managers), complete
  and cancel.
- **Contacts:** a directory; add, edit and deactivate; contacts on each profile.
- **Call cycle:** the next six weeks as a list or week grid; plan, reschedule
  and cancel visits; a post-visit scorecard.
- **Notifications:** your history by day; mark read or all read.
- **Contracts:** renewals by band with search; contracts on each profile.
- **Organisation settings:** each organisation's own divisions, lenses and
  time zone; every date shows on the organisation's calendar.
- Light and dark mode, switched with one toggle in the top bar; Ctrl K search
  for accounts and contacts.
