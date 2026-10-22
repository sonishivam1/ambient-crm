# Plans

One file per step of work, written when the plan is agreed and kept after the
work is done. A plan says what we intend to build and why; its **As built**
section records what actually happened, what changed from the plan, and what
we learned. Together with the [build log](../engineering/build-log.md) this is
how the product's history stays readable after the sessions that built it.

**What's left for v1:** the [completion plan](completion-plan.md) lists every
unbuilt page and feature as work packages in waves; each gets its own plan
here when it starts.

| Plan | Area | Status |
| --- | --- | --- |
| [Completion plan: everything left for v1](completion-plan.md) | All | Agreed, scope frozen (22 Oct 2026) |
| [Wave 1.1: end-to-end tests](wave-1-1-end-to-end-tests.md) | Testing | ✅ Built |
| [AI step 1: engine core](ai-step-1-engine-core.md) | AI | ✅ Built (`c36a1b7`) |
| [Logger](logger.md) | Platform | ✅ Built |
| [Observability and API foundation](observability-and-api-foundation.md) | Platform | ✅ Built |
| [AI step 2: fact sources and cards](ai-step-2-fact-sources-and-cards.md) | AI | ✅ Built (`7c11a1d`) |
| [AI step 3: account summary](ai-step-3-account-summary.md) | AI | ✅ Built (`7ecf30d`) |
| [AI step 4: morning brief](ai-step-4-morning-brief.md) | AI | ✅ Built (`f9a4d16`) |
| [AI step 5: Wren chat](ai-step-5-wren-chat.md) | AI | ✅ Built (`279ba0c`) |
| [AI step 6: proposals and the side panel](ai-step-6-proposals.md) | AI | ✅ Built (`ac727c7`) |
| [AI step 7: evaluation and feedback](ai-step-7-evaluation-and-feedback.md) | AI | ✅ Built (`071b26b`) |

Earlier work (the core CRM screens, tenancy, CI) predates this folder; its
history is in the [build log](../engineering/build-log.md).

## Template

```markdown
# <Title>

**Status:** Agreed | Building | Built (`<commit>`)
**Agreed:** <date> · **Built:** <date>

## Goal
One paragraph: what this step achieves and why now.

## Scope
What gets built, as a table or list. What is explicitly not in scope.

## Decisions
Choices made when the plan was agreed, with the reason for each.

## Tests
What proves it works, including what must be refused or hidden.

## Docs to update
Which documents change with this step.

## As built
Filled in when done: what changed from the plan, verification results,
commits, and lessons learned.
```
