import "server-only";

import { OPEN_TASK_STATUSES, collection } from "@ambient/db";

import { getAccountProfile } from "@/lib/data/account-profile";
import type { Scope } from "@/lib/data/scope";
import { decorateVisits } from "@/lib/data/visits";

import { factsBuilder, type FactPacket } from "../facts";

import { factDate } from "./format";
import { addAccount, addContact, addContract, addInteraction, addTask, addVisit } from "./records";

/** How many of each record one account's facts hold. */
export const ACCOUNT_CAPS = { tasks: 10, plannedVisits: 3, recentVisits: 3, interactions: 5, contracts: 10, contacts: 8 } as const;

/**
 * Facts about one account, for the account summary (step 3) and Wren's
 * get_account (step 5). Built on getAccountProfile(), so it holds exactly what
 * the profile page would show this user. Null when the account doesn't exist,
 * is inactive, or is outside the user's scope or tenant: the caller says "not
 * found" for all of them.
 */
export async function accountFacts(scope: Scope, input: { accountId: string }): Promise<FactPacket | null> {
  const profile = await getAccountProfile(input.accountId);
  if (!profile) return null;
  const { account } = profile;
  const tz = scope.timeZone;

  // Visits as the profile reads them (every visit on this account), with reports.
  // Planned ones come oldest first, so a visit whose day passed without being closed shows.
  const visits = await collection("visits");
  const onAccount = { ...scope.tenant(), accountId: account.id, deletedAt: null };
  const [planned, recent] = await Promise.all([
    visits.find({ ...onAccount, status: "planned" }).sort({ scheduledAt: 1 }).limit(ACCOUNT_CAPS.plannedVisits).toArray(),
    visits.find({ ...onAccount, status: "completed" }).sort({ scheduledAt: -1 }).limit(ACCOUNT_CAPS.recentVisits).toArray(),
  ]);
  const [plannedRows, recentRows] = await Promise.all([decorateVisits(scope, planned), decorateVisits(scope, recent)]);

  // Open tasks soonest first, then the most recently due completed ones.
  const open = profile.tasks.filter((t) => OPEN_TASK_STATUSES.includes(t.status));
  const done = profile.tasks.filter((t) => t.status === "completed").reverse();
  const tasks = [...open, ...done].slice(0, ACCOUNT_CAPS.tasks);

  const f = factsBuilder();
  const facts = {
    account: addAccount(f, account, {
      segment: account.segment,
      division: account.divisionLabel,
      lastTouch: profile.lastTouch ? factDate(profile.lastTouch, tz) : "No contact logged",
      group: profile.group?.name ?? null,
    }),
    counts: {
      openTasks: profile.counts.openTasks,
      overdueTasks: profile.counts.overdue,
      contracts: profile.contracts.length,
      activeContacts: profile.contacts.length,
    },
    tasks: tasks.map((t) => addTask(f, { ...t, accountId: account.id, account: account.name }, tz, { withOwner: true })),
    visits: {
      planned: plannedRows.map((v) => addVisit(f, v, tz)),
      recent: recentRows.map((v) => addVisit(f, v, tz)),
    },
    interactions: profile.timeline
      .filter((i) => i.kind === "interaction")
      .slice(0, ACCOUNT_CAPS.interactions)
      .map((i) => addInteraction(f, { ...i, accountId: account.id }, tz)),
    contracts: profile.contracts.slice(0, ACCOUNT_CAPS.contracts).map((k) => addContract(f, k, tz)),
    contacts: profile.contacts.slice(0, ACCOUNT_CAPS.contacts).map((c) => addContact(f, c)),
  };
  return f.build(facts);
}
