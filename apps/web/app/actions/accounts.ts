"use server";

import { z } from "zod";

import { collection } from "@ambient/db";

import { getChildAccounts, type ChildAccount } from "@/lib/data/accounts";
import { getScope } from "@/lib/data/scope";
import { loggedAction } from "@/lib/log";

export type AccountOption = { id: string; name: string; code: string };

const parent = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("group"), id: z.string().min(1).max(200) }),
  z.object({ kind: z.literal("billTo"), id: z.string().min(1).max(200) }),
]);

/** Children for an expanded row: a group's bill-tos, or a bill-to's sold-tos. Scoped like every query. */
export const loadChildAccounts = loggedAction("accounts.loadChildren", async function loadChildAccounts(raw: unknown): Promise<ChildAccount[]> {
  const input = parent.parse(raw);
  return input.kind === "group" ? getChildAccounts({ groupId: input.id }) : getChildAccounts({ billToId: input.id });
});

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Bill-to accounts in scope, by name or code, for the task and contact dialogs. */
export const searchBillToAccounts = loggedAction("accounts.searchBillTos", async function searchBillToAccounts(raw: string): Promise<AccountOption[]> {
  const q = z.string().trim().max(100).parse(raw);
  const scope = await getScope();
  const filter: Record<string, unknown> = { ...scope.filter(), type: "bill_to", active: true };
  if (q) {
    const pattern = new RegExp(escapeRegex(q), "i");
    filter.$or = [{ name: pattern }, { code: pattern }];
  }
  const rows = await (await collection("accounts")).find(filter, { projection: { name: 1, code: 1 } }).sort({ name: 1 }).limit(8).toArray();
  return rows.map((a) => ({ id: a._id, name: a.name, code: a.code }));
});

/** The sold-to sites under a bill-to in scope (empty when the bill-to isn't visible). */
export const listSoldTos = loggedAction("accounts.listSoldTos", async function listSoldTos(rawId: string): Promise<AccountOption[]> {
  const billToId = z.string().min(1).max(200).parse(rawId);
  const scope = await getScope();
  const rows = await (await collection("accounts"))
    .find({ ...scope.filter(), parentId: billToId, type: "sold_to", active: true }, { projection: { name: 1, code: 1 } })
    .sort({ name: 1 })
    .limit(200)
    .toArray();
  return rows.map((a) => ({ id: a._id, name: a.name, code: a.code }));
});
