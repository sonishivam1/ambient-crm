/**
 * The morning brief's feature prompt, sent after the policy prompt. The text
 * matches docs/architecture/ai-prompts.md (`morning-brief` v1); change both
 * together and bump the version. Pure: no I/O.
 */

export const MORNING_BRIEF_VERSION = 1;

export const MORNING_BRIEF_TASK = `TASK
Write the user's morning brief for today.

From <facts>, pick at most 6 items that most need attention today, most
urgent first. Give each item one kind:
- overdue_task: an overdue task
- visit_today: a visit planned for today
- task_due: a task due today
- renewal: a contract renewing within 30 days
- alert: an unread notification
- quiet_account: an account with no contact in the last 30 days

Each item: a priority (high, normal or low), at most 20 words, and at least
one source. Prefer one item per record; group records only when they belong
together, such as two overdue tasks on one account.
counts gives the full totals; mention a total only as it appears there.
If nothing in <facts> needs attention, return no items.`;
