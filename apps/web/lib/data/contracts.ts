import "server-only";

import { z } from "zod";

import { collection, type Contract } from "@ambient/db";
import { addDays, calendarDaysBetween } from "@ambient/db/time";

import { BAND, EXPIRED_WINDOW_DAYS, RENEWAL_BANDS, bandFor, type RenewalBand } from "@/lib/contracts";

import { getScope, type Scope } from "./scope";

export const CONTRACT_PAGE_SIZE = 25;

/** URL search params for /contracts, parsed leniently. */
export const contractsQuerySchema = z.object({
  band: z.enum(["", ...RENEWAL_BANDS]).catch(""),
  q: z.string().trim().max(100).catch(""),
  account: z.string().max(200).catch(""),
  sort: z.enum(["end", "value"]).catch("end"),
  page: z.coerce.number().int().min(1).max(10_000).catch(1),
});
export type ContractsQuery = z.infer<typeof contractsQuerySchema>;

export type ContractRow = {
  id: string;
  number: string;
  name: string;
  accountId: string;
  account: string;
  owner: string;
  value: number;
  startDate: Date;
  endDate: Date;
  daysLeft: number;
  band: RenewalBand;
};

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The end-date range a band covers, on the tenant's calendar (end dates are local midnights). */
function bandRange(scope: Scope, band: RenewalBand) {
  const { from, to } = BAND[band];
  const at = (days: number) => addDays(scope.today, days, scope.timeZone);
  return { $gte: at(from), ...(Number.isFinite(to) ? { $lt: at(to + 1) } : {}) };
}

/** Active contracts the user can see that haven't been over for longer than the expired window. */
function baseFilter(scope: Scope) {
  return { ...scope.filter(), status: "active" as const, endDate: { $gte: addDays(scope.today, -EXPIRED_WINDOW_DAYS, scope.timeZone) } };
}

async function decorate(scope: Scope, contracts: Contract[]): Promise<ContractRow[]> {
  const [accounts, reps] = await Promise.all([
    (await collection("accounts")).find({ ...scope.tenant(), _id: { $in: [...new Set(contracts.map((k) => k.accountId))] } }, { projection: { name: 1 } }).toArray(),
    (await collection("reps")).find(scope.tenant(), { projection: { name: 1 } }).toArray(),
  ]);
  const accountName = new Map(accounts.map((a) => [a._id, a.name]));
  const repName = new Map(reps.map((r) => [r._id, r.name]));
  return contracts.map((k) => {
    const daysLeft = calendarDaysBetween(scope.today, k.endDate, scope.timeZone);
    return {
      id: k._id,
      number: k.number,
      name: k.name,
      accountId: k.accountId,
      account: accountName.get(k.accountId) ?? "",
      owner: repName.get(k.ownerRepId) ?? "",
      value: k.value,
      startDate: k.startDate,
      endDate: k.endDate,
      daysLeft,
      band: bandFor(daysLeft),
    };
  });
}

/** Renewals: soonest end first (or largest value), with a count per band for the cards on top. */
export async function getContractsPage(query: ContractsQuery) {
  const scope = await getScope();
  const contracts = await collection("contracts");
  const base: Record<string, unknown> = baseFilter(scope);
  if (query.account) base.accountId = query.account;
  if (query.q) {
    const pattern = new RegExp(escapeRegex(query.q), "i");
    const accountIds = await (await collection("accounts")).distinct("_id", { ...scope.filter(), type: "bill_to", $or: [{ name: pattern }, { code: pattern }] });
    base.$or = [{ name: pattern }, { number: pattern }, { accountId: { $in: accountIds } }];
  }
  // A band narrows the end date further, inside the base window.
  const filter = query.band ? { ...base, $and: [{ endDate: bandRange(scope, query.band) }] } : base;

  const [rows, total, ...bandCounts] = await Promise.all([
    contracts
      .find(filter)
      .sort(query.sort === "value" ? { value: -1, endDate: 1, _id: 1 } : { endDate: 1, _id: 1 })
      .skip((query.page - 1) * CONTRACT_PAGE_SIZE)
      .limit(CONTRACT_PAGE_SIZE)
      .toArray(),
    contracts.countDocuments(filter),
    ...RENEWAL_BANDS.map((b) => contracts.countDocuments({ ...base, $and: [{ endDate: bandRange(scope, b) }] })),
  ]);

  return {
    rows: await decorate(scope, rows),
    total,
    pages: Math.max(1, Math.ceil(total / CONTRACT_PAGE_SIZE)),
    counts: Object.fromEntries(RENEWAL_BANDS.map((b, i) => [b, bandCounts[i] ?? 0])) as Record<RenewalBand, number>,
    showOwner: scope.user.capabilities.manager || scope.reps.all,
    timeZone: scope.timeZone,
  };
}

/** Contracts for a customer profile: the bill-to's (a sold-to shows its bill-to's), soonest end first. */
export async function getAccountContracts(scope: Scope, billToId: string | null) {
  if (!billToId) return [];
  const rows = await (await collection("contracts")).find({ ...baseFilter(scope), accountId: billToId }).sort({ endDate: 1 }).limit(20).toArray();
  return decorate(scope, rows);
}
