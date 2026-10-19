"use server";

import { z } from "zod";

import { getChildAccounts, type ChildAccount } from "@/lib/data/accounts";

const parent = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("group"), id: z.string().min(1).max(200) }),
  z.object({ kind: z.literal("billTo"), id: z.string().min(1).max(200) }),
]);

/** Children for an expanded row: a group's bill-tos, or a bill-to's sold-tos. Scoped like every query. */
export async function loadChildAccounts(raw: unknown): Promise<ChildAccount[]> {
  const input = parent.parse(raw);
  return input.kind === "group" ? getChildAccounts({ groupId: input.id }) : getChildAccounts({ billToId: input.id });
}
