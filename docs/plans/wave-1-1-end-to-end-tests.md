# Wave 1.1: end-to-end tests (Playwright)

**Status:** Built
**Agreed:** 22 Oct 2026 · **Built:** 22 Oct 2026 · Package 1.1 of the [completion plan](completion-plan.md)

## Goal
Prove the app works the way a person uses it: real pages in a real browser,
signed in as each role, against freshly seeded demo data. Unit and
integration tests already cover the rules; these catch what they can't (a
broken page, a dialog that doesn't save, a role that sees too much, a console
error, a layout that breaks on a phone).

## Scope

### Setup
- `@playwright/test` in `apps/web`; specs in `apps/web/e2e/`, config in
  `apps/web/playwright.config.ts`. `pnpm test:e2e` from the repo root or
  `apps/web`. Never part of `pnpm test`.
- **Production build:** the run builds the app and serves it with
  `next start` on port 3100 (so a running dev server on 3000 is untouched).
- **A throwaway database per run:** `ambient_test_<epoch>_<random>`, seeded
  with the demo data before the tests and dropped after; never `ambient_crm`.
  Locally on the Atlas cluster (from `apps/web/.env.local`), in CI on the
  Atlas Local service. Stale ones are removed like the integration suite's.
- **Sign-in:** development sign-in (the `amb_dev_user` cookie) per test. A
  production build normally refuses it; it is allowed only when
  `AMBIENT_DEV_AUTH=1`, `AMBIENT_E2E=1` **and** the database is an
  `ambient_test_*` one, so a real deployment can never enable it by accident.
- **AI off:** no OpenAI key, so the AI screens show their "not set up" state.
- **Chromium only**, desktop and phone (390 × 844) viewports. No screenshot
  comparisons. Traces and screenshots kept on failure.
- Every test fails on a browser console error or an uncaught page error.

### Journeys
- **Roles:** each role signs in and sees its dashboard; a rep sees only their
  own accounts, a manager their team's, an admin none; the other tenant sees
  only its own data; admin pages are a 404 for non-admins.
- **Accounts:** list, search, group page, bill-to profile, logging an
  interaction.
- **Tasks:** create a task through the form, find it, mark it complete.
- **Visits:** plan a visit, report a past one.
- **Contacts and contracts:** add a contact; the contracts list and filter.
- **Notifications:** unread badge, open, mark all read.
- **Assistant:** the chat page and side panel open and say AI isn't set up;
  the tenant with AI off says so.
- **Theme:** the switch toggles dark mode and it survives a reload.
- **Phone width:** the main pages fit without sideways scrolling and the
  navigation opens.

### Accessibility fixes found on the way
- Form field labels in the dialogs are linked to their inputs (screen readers
  read them; tests find fields by label).

### CI
- A third job, **End-to-end tests**, on every push to `main` and every pull
  request (the same triggers as the others): Atlas Local service, install
  Chromium, build, run. The report and traces are uploaded when it fails.

## Decisions
- Production build, not the dev server.
- Chromium only.
- No screenshot comparisons.
- The e2e job runs on every push.

## Tests
- Unit: development sign-in is off in production unless both the e2e flag and
  a test database are set.
- The journeys above.

## Docs to update
Testing, getting started (running them), roadmap, build log, changelog,
completion plan, CLAUDE.md.

## As built
- **Setup:** `@playwright/test` 1.64.0; `apps/web/playwright.config.ts`;
  `e2e/support/` (`global-setup.ts` seeds through `pnpm db:seed`'s script,
  `global-teardown.ts` drops the database, `test.ts` has the `signInAs` and
  console-error fixtures, `dates.ts` has tenant-zone dates); `pnpm test:e2e`
  (`E2E_SKIP_BUILD=1` reuses the last build). `devAuthEnabled()` allows a
  production build only with `AMBIENT_E2E=1` and an `ambient_test_*`
  database. The shared `tests/support/test-db.ts` finds `.env.local` from the
  working directory, because Playwright loads it as CommonJS.
- **Specs:** 38 tests in 9 files: `roles`, `accounts`, `tasks`, `visits`,
  `contacts-contracts`, `notifications`, `assistant`, `theme` (27 on
  desktop) and `phone` (11 at 390 px).
- **CI:** a third job, **End-to-end tests**, with the Atlas Local service:
  installs Chromium, builds, runs; uploads the report and traces when it
  fails.
- **Found and fixed on the way:**
  - The account group and bill-to pages were 415 px wide on a 390 px phone:
    their two-column grid had no base column, so the sold-to list stretched
    it. Both now start from one column that can shrink (`grid-cols-1`).
  - Dialog field labels weren't linked to their inputs. `Field` is now a
    `<label>`; fields holding several controls, a button or read-only text
    are named groups instead.
- **Changed from the plan:**
  - Without a key every tenant shows "AI isn't set up yet" (that check
    comes first), so the tenant with AI off can't be told apart in the
    browser; both are checked for the not-set-up state, and "turned off for
    your organisation" stays covered by the integration tests.
  - Notifications: mark one read, then all.
  - The task form keeps "Create task" disabled until there's a title, so
    the test checks that rather than an error message.
  - Added logging an interaction (listed in the testing guide's "still to
    add").
- **Verified:** 38 end-to-end tests pass locally in about 2 minutes plus the
  build; a planted bug (reps see every account) fails 3 of them; 5 new unit
  tests for the sign-in guard; 95 unit and 194 integration tests; lint and
  typecheck clean.
- **Lessons:**
  - A not-found inside a streamed page answers HTTP 200: check the page,
    not the status.
  - A body-level ARIA snapshot can come back empty; snapshot `main`,
    `header` and `aside` instead.
