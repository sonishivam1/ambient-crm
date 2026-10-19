"use server";

import { z } from "zod";

import { collection } from "@ambient/db";

import { fullName } from "@/lib/contacts";
import { getScope } from "@/lib/data/scope";

export type PaletteResult = { id: string; href: string; title: string; subtitle: string; kind: "account" | "contact" };

const query = z.string().trim().max(100);
const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Quick jump for the Ctrl K palette: accounts the user can see, by name or
 * code, and active contacts on them, by name or email.
 */
export async function paletteSearch(raw: string): Promise<PaletteResult[]> {
  const q = query.parse(raw);
  if (q.length < 2) return [];
  const scope = await getScope();
  const pattern = new RegExp(escapeRegex(q), "i");
  // Every word must match a contact's first name, last name or email.
  const words = q.split(/\s+/).filter(Boolean).slice(0, 6);
  const contactMatch = { $and: words.map((w) => ({ $or: ["firstName", "lastName", "email"].map((f) => ({ [f]: new RegExp(escapeRegex(w), "i") })) })) };

  const accountsColl = await collection("accounts");
  const [accounts, contacts] = await Promise.all([
    accountsColl
      .find({ ...scope.filter(), active: true, $or: [{ name: pattern }, { code: pattern }] }, { projection: { name: 1, code: 1, type: 1, site: 1 } })
      .sort({ type: 1, fyRevenue: -1 })
      .limit(8)
      .toArray(),
    (await collection("contacts"))
      .find({ ...scope.filter(), deletedAt: null, active: true, ...contactMatch }, { projection: { firstName: 1, lastName: 1, jobTitle: 1, accountId: 1 } })
      .sort({ lastName: 1, firstName: 1 })
      .limit(5)
      .toArray(),
  ]);
  const accountName = new Map(
    (await accountsColl.find({ ...scope.tenant(), _id: { $in: contacts.map((c) => c.accountId) } }, { projection: { name: 1 } }).toArray()).map((a) => [
      a._id,
      a.name,
    ]),
  );

  return [
    ...accounts.map(
      (a): PaletteResult => ({
        id: a._id,
        href: `/accounts/${encodeURIComponent(a._id)}`,
        title: a.name,
        subtitle: `${a.type === "bill_to" ? "Bill-To" : "Sold-To"} · ${a.code} · ${a.site}`,
        kind: "account",
      }),
    ),
    ...contacts.map(
      (c): PaletteResult => ({
        id: c._id,
        href: `/accounts/${encodeURIComponent(c.accountId)}`,
        title: fullName(c),
        subtitle: [c.jobTitle, accountName.get(c.accountId)].filter(Boolean).join(" · "),
        kind: "contact",
      }),
    ),
  ];
}
