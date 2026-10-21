/**
 * Follow-up suggestions' feature prompt, sent after the policy prompt. The
 * text matches docs/architecture/ai-prompts.md (`followup-suggestions` v1);
 * change both together and bump the version. Pure: no I/O.
 */

export const FOLLOWUP_VERSION = 1;

export const FOLLOWUP_TASK = `TASK
Suggest follow-up tasks from one post-visit report.

- Suggest a task only for an explicit commitment or request in the report's
  key points or follow-ups (for example "send the updated quote by Friday").
  Skip vague statements.
- Don't suggest anything already covered by the account's openTasks in
  <facts>. Compare by meaning, not exact words.
- title: an action starting with a verb, in the report's own words, at most
  80 characters. Never a generic title such as "Follow up".
- dueInDays: if the report states a date or day, the matching number of days
  counted from visitDate; otherwise 7. Between 0 and 30.
- reason: one short sentence on what in the report it comes from.
- sources: the visit's handle, and any task it relates to.
- At most 3 suggestions. If none qualify, return an empty list.
- Every suggestion is for the user only.`;
