"use server";

import { z } from "zod";

import { collection } from "@ambient/db";

import { getScope } from "@/lib/data/scope";

export type PaletteResult = { id: string; href: string; title: string; subtitle: string; kind: "account" };

const query = z.string().trim().max(100);

/** Quick jump for the Ctrl K palette: accounts the user can see, by name or code. */
export async function paletteSearch(raw: string): Promise<PaletteResult[]> {
  const q = query.parse(raw);
  if (q.length < 2) return [];
  const scope = await getScope();
  const pattern = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
  const accounts = await (await collection("accounts"))
    .find({ ...scope.filter(), active: true, $or: [{ name: pattern }, { code: pattern }] }, { projection: { name: 1, code: 1, type: 1, site: 1 } })
    .sort({ type: 1, fyRevenue: -1 })
    .limit(8)
    .toArray();
  return accounts.map((a) => ({
    id: a._id,
    href: `/accounts/${encodeURIComponent(a._id)}`,
    title: a.name,
    subtitle: `${a.type === "bill_to" ? "Bill-To" : "Sold-To"} · ${a.code} · ${a.site}`,
    kind: "account",
  }));
}
