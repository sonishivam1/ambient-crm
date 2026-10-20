import "server-only";

import { collection } from "@ambient/db";
import { isoDayIn } from "@ambient/db/time";

import type { Scope } from "@/lib/data/scope";

/*
 * The monthly AI token ledger. A call reserves its estimate before it runs and
 * settles to the real usage after, in single atomic updates, so concurrent
 * calls can never reserve past the tenant's budget.
 */

/** The ledger month on the tenant's calendar, e.g. "2026-10". */
export const ledgerMonth = (scope: Scope, now = new Date()) => isoDayIn(now, scope.timeZone).slice(0, 7);
const ledgerId = (scope: Scope, month: string) => `${scope.tenantId}:${month}`;

/** A rough upper estimate: about four characters per token, plus the reply's cap. */
export function estimateTokens(promptChars: number, maxOutputTokens: number): number {
  return Math.ceil(promptChars / 4) + maxOutputTokens;
}

async function ensureLedger(scope: Scope, month: string) {
  try {
    await (await collection("aiUsage")).updateOne(
      { _id: ledgerId(scope, month) },
      { $setOnInsert: { tenantId: scope.tenantId, month, reserved: 0, used: 0, updatedAt: new Date() } },
      { upsert: true },
    );
  } catch (e) {
    // Two first calls in a month can race to create the ledger; one wins.
    if (!(e && typeof e === "object" && "code" in e && e.code === 11000)) throw e;
  }
}

/** Reserve tokens against this month's budget. Returns the ledger month, or null when it doesn't fit. */
export async function reserveTokens(scope: Scope, tokens: number): Promise<string | null> {
  const budget = scope.user.tenant.ai.monthlyTokenBudget;
  const month = ledgerMonth(scope);
  await ensureLedger(scope, month);
  const updated = await (await collection("aiUsage")).findOneAndUpdate(
    { _id: ledgerId(scope, month), $expr: { $lte: [{ $add: ["$reserved", "$used", tokens] }, budget] } },
    { $inc: { reserved: tokens }, $set: { updatedAt: new Date() } },
  );
  return updated ? month : null;
}

/** Release a reservation and record what was actually used (0 when no call was made). */
export async function settleTokens(scope: Scope, month: string, reserved: number, used: number) {
  await (await collection("aiUsage")).updateOne(
    { _id: ledgerId(scope, month) },
    { $inc: { reserved: -reserved, used }, $set: { updatedAt: new Date() } },
  );
}

/** Tokens left this month (budget minus used and in-flight reservations). */
export async function tokensLeft(scope: Scope): Promise<number> {
  const row = await (await collection("aiUsage")).findOne({ _id: ledgerId(scope, ledgerMonth(scope)) });
  return scope.user.tenant.ai.monthlyTokenBudget - (row?.used ?? 0) - (row?.reserved ?? 0);
}
