"use server";

import { randomUUID } from "node:crypto";

import { refresh } from "next/cache";
import type { z } from "zod";

import { collection, getClient, type ClientSession, type Visit } from "@ambient/db";
import { addDays, fromIsoDay } from "@ambient/db/time";

import { audit } from "@/lib/audit";
import { visibleReps } from "@/lib/data/visits";
import { getScope, type Scope } from "@/lib/data/scope";
import { fmtDay, fmtTime } from "@/lib/format";
import { cancelVisitInput, completeVisitInput, createVisitInput, parseTime, updateVisitInput } from "@/lib/visits";
import { loggedAction } from "@/lib/log";

export type VisitActionResult = { ok: true; id: string } | { ok: false; error: string };

const firstIssue = (e: z.ZodError) => e.issues[0]?.message ?? "Invalid input.";
const PAST = "Pick today or a later date.";

/** The visit's moment on the tenant's clock. */
const scheduledFrom = (scope: Scope, date: string, time: string) => fromIsoDay(date, scope.timeZone, ...parseTime(time));

/**
 * Who makes the visit: yourself, or (managers) a rep inside your scope. An
 * error string when the choice isn't allowed.
 */
async function resolveRep(scope: Scope, requested: string | null | undefined, current?: string): Promise<string | { error: string }> {
  const { user } = scope;
  const wanted = requested || current || user.repId;
  if (!wanted) return { error: "Choose who is making this visit." };
  if (wanted === current || wanted === user.repId) return wanted;
  if (!user.capabilities.canAssignTasks) return { error: "You can only plan visits for yourself." };
  const allowed = await visibleReps(scope);
  return allowed.some((r) => r.id === wanted) ? wanted : { error: "You can't plan visits for that person." };
}

/** Tell a rep when someone else books a visit for them, inside the same transaction. */
async function notifyRep(scope: Scope, visit: Visit, accountName: string, session: ClientSession) {
  if (visit.repId === scope.user.repId) return;
  const users = await (await collection("users")).find({ ...scope.tenant(), repId: visit.repId, deletedAt: null }, { projection: { _id: 1 }, session }).toArray();
  if (!users.length) return;
  const when = `${fmtDay(visit.scheduledAt, scope.timeZone)}, ${fmtTime(visit.scheduledAt, scope.timeZone)}`;
  await (await collection("notifications")).insertMany(
    users.map((u) => ({
      _id: randomUUID(),
      tenantId: scope.tenantId,
      userId: u._id,
      type: "visit_assigned" as const,
      accountId: visit.accountId,
      title: `${scope.user.name} booked you a visit`,
      body: `${accountName} · ${when}`,
      readAt: null,
      createdAt: new Date(),
    })),
    { session },
  );
}

/** Plan a visit, call or meeting on a bill-to the user can see, for today or later. */
export const createVisit = loggedAction("visits.create", async function createVisit(raw: unknown): Promise<VisitActionResult> {
  const parsed = createVisitInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const input = parsed.data;
  const scope = await getScope();
  const scheduledAt = scheduledFrom(scope, input.date, input.time);
  if (scheduledAt < scope.today) return { ok: false, error: PAST };
  const repId = await resolveRep(scope, input.repId);
  if (typeof repId !== "string") return { ok: false, ...repId };

  const client = await getClient();
  let result: VisitActionResult = { ok: false, error: "Account not found." };
  await client.withSession((session) =>
    session.withTransaction(async () => {
      const account = await (await collection("accounts")).findOne(
        { _id: input.accountId, ...scope.filter(), type: "bill_to", active: true },
        { session },
      );
      if (!account) return;
      const now = new Date();
      const visit: Visit = {
        _id: randomUUID(),
        tenantId: scope.tenantId,
        accountId: account._id,
        division: account.division,
        repId,
        type: input.type,
        status: "planned",
        purpose: input.purpose,
        scheduledAt,
        report: null,
        completedAt: null,
        cancelReason: null,
        createdByUserId: scope.user._id,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
        deletedBy: null,
      };
      await (await collection("visits")).insertOne(visit, { session });
      await audit(
        scope.user,
        { action: "visit.create", entity: "visit", entityId: visit._id, before: null, after: { accountId: visit.accountId, repId, type: visit.type, scheduledAt } },
        session,
      );
      await notifyRep(scope, visit, account.name, session);
      result = { ok: true, id: visit._id };
    }),
  );
  if (result.ok) refresh();
  return result;
});

/** Reschedule or edit a planned visit in scope. Managers may hand it to another rep in their scope. */
export const updateVisit = loggedAction("visits.update", async function updateVisit(raw: unknown): Promise<VisitActionResult> {
  const parsed = updateVisitInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const input = parsed.data;
  const scope = await getScope();
  const visits = await collection("visits");
  const client = await getClient();
  let result: VisitActionResult = { ok: false, error: "Visit not found." };

  await client.withSession((session) =>
    session.withTransaction(async () => {
      const before = await visits.findOne({ _id: input.id, ...scope.filter("repId"), deletedAt: null }, { session });
      if (!before) return;
      if (before.status !== "planned") {
        result = { ok: false, error: "Only planned visits can be changed." };
        return;
      }
      const scheduledAt = scheduledFrom(scope, input.date, input.time);
      const moved = scheduledAt.getTime() !== before.scheduledAt.getTime();
      if (moved && scheduledAt < scope.today) {
        result = { ok: false, error: PAST };
        return;
      }
      const repId = await resolveRep(scope, input.repId, before.repId);
      if (typeof repId !== "string") {
        result = { ok: false, ...repId };
        return;
      }
      const next = { scheduledAt, type: input.type, purpose: input.purpose, repId };
      const changedBefore: Record<string, unknown> = {};
      const changedAfter: Record<string, unknown> = {};
      for (const key of ["scheduledAt", "type", "purpose", "repId"] as const) {
        const a = before[key];
        const b = next[key];
        if ((a instanceof Date && b instanceof Date ? a.getTime() !== b.getTime() : a !== b)) {
          changedBefore[key] = a;
          changedAfter[key] = b;
        }
      }
      result = { ok: true, id: before._id };
      if (!Object.keys(changedAfter).length) return;
      await visits.updateOne({ _id: before._id }, { $set: { ...next, updatedAt: new Date() } }, { session });
      await audit(
        scope.user,
        { action: moved ? "visit.reschedule" : "visit.update", entity: "visit", entityId: before._id, before: changedBefore, after: changedAfter },
        session,
      );
      if (repId !== before.repId) {
        const account = await (await collection("accounts")).findOne({ ...scope.tenant(), _id: before.accountId }, { projection: { name: 1 }, session });
        await notifyRep(scope, { ...before, ...next }, account?.name ?? "", session);
      }
    }),
  );
  if (result.ok) refresh();
  return result;
});

/** Cancel a planned visit in scope with an optional short reason. */
export const cancelVisit = loggedAction("visits.cancel", async function cancelVisit(raw: unknown): Promise<VisitActionResult> {
  const parsed = cancelVisitInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const { id, reason } = parsed.data;
  const scope = await getScope();
  const visits = await collection("visits");
  const client = await getClient();
  let result: VisitActionResult = { ok: false, error: "Visit not found." };

  await client.withSession((session) =>
    session.withTransaction(async () => {
      const before = await visits.findOne({ _id: id, ...scope.filter("repId"), deletedAt: null }, { session });
      if (!before) return;
      if (before.status !== "planned") {
        result = { ok: false, error: "Only planned visits can be cancelled." };
        return;
      }
      await visits.updateOne({ _id: id }, { $set: { status: "cancelled", cancelReason: reason || null, updatedAt: new Date() } }, { session });
      await audit(scope.user, { action: "visit.cancel", entity: "visit", entityId: id, before: { status: "planned" }, after: { status: "cancelled", reason: reason || null } }, session);
      result = { ok: true, id };
    }),
  );
  if (result.ok) refresh();
  return result;
});

/**
 * Complete a visit with its scorecard, or add the scorecard to a completed
 * visit that has none. A visit can't be completed before its day.
 */
export const completeVisit = loggedAction("visits.complete", async function completeVisit(raw: unknown): Promise<VisitActionResult> {
  const parsed = completeVisitInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const { id, ...card } = parsed.data;
  const scope = await getScope();
  const visits = await collection("visits");
  const client = await getClient();
  let result: VisitActionResult = { ok: false, error: "Visit not found." };

  await client.withSession((session) =>
    session.withTransaction(async () => {
      const before = await visits.findOne({ _id: id, ...scope.filter("repId"), deletedAt: null }, { session });
      if (!before || before.status === "cancelled") return;
      if (before.report) {
        result = { ok: false, error: "This visit already has a report." };
        return;
      }
      if (before.scheduledAt >= addDays(scope.today, 1, scope.timeZone)) {
        result = { ok: false, error: "A visit can be completed on or after its day." };
        return;
      }
      const now = new Date();
      const report = { ...card, capturedAt: now, capturedByUserId: scope.user._id };
      await visits.updateOne(
        { _id: id },
        { $set: { status: "completed", report, completedAt: before.completedAt ?? now, updatedAt: now } },
        { session },
      );
      await audit(
        scope.user,
        {
          action: before.status === "completed" ? "visit.report" : "visit.complete",
          entity: "visit",
          entityId: id,
          before: { status: before.status },
          // Scores only; key points and follow-ups are flagged, never copied.
          after: {
            status: "completed",
            sentiment: card.sentiment,
            relationship: card.relationship,
            commercial: card.commercial,
            service: card.service,
            hasKeyPoints: !!card.keyPoints,
            hasFollowUps: !!card.followUps,
          },
        },
        session,
      );
      result = { ok: true, id };
    }),
  );
  if (result.ok) refresh();
  return result;
});
