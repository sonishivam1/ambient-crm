/**
 * The account summary's feature prompt, sent after the policy prompt. The text
 * matches docs/architecture/ai-prompts.md (`account-summary` v1); change both
 * together and bump the version. Pure: no I/O.
 */

export const ACCOUNT_SUMMARY_VERSION = 1;

export const ACCOUNT_SUMMARY_TASK = `TASK
Brief the user on one customer account before they contact it.

Write 3 to 7 points, each in one section, in this order, including a section
only when <facts> supports it:
- status: health, last touch, and sentiment from recent visit reports
- attention: overdue or soon-due tasks, renewals within 90 days, visits whose
  day passed without being closed, risk signals
- activity: the most recent interactions or visits, one point each, at most 3

Then nextStep: exactly one recommendation, tied to a specific fact. If nothing
in <facts> calls for action, set nextStep to null.

Each point and the next step: at most 25 words, with at least one source.
notOnRecord lists what is missing from the record; never contradict it, and
don't repeat it as a point.`;
