import "server-only";

import { collection } from "@ambient/db";

import type { Scope } from "@/lib/data/scope";

/**
 * "ACME SAFETY" → "Acme Safety", for a friendlier chip; Wren matches names
 * case-insensitively. Words of three letters or fewer stay as they are, since
 * they're usually abbreviations (WA, NZ, PPE).
 */
export const titleCase = (name: string) => name.replace(/\p{L}+/gu, (word) => (word.length <= 3 ? word : word[0] + word.slice(1).toLowerCase()));

/**
 * The questions offered above Wren's box: one about the user's largest
 * account (only one they can see), then general ones every tool can answer.
 */
export async function chatSuggestions(scope: Scope): Promise<string[]> {
  const top = await (await collection("accounts")).findOne(
    { ...scope.filter(), type: "bill_to", active: true },
    { projection: { name: 1 }, sort: { fyRevenue: -1, _id: 1 } },
  );
  return [
    ...(top ? [`Summarise ${titleCase(top.name)}`] : []),
    "What needs attention today?",
    "Show upcoming renewals",
    "What's overdue?",
    "My visits this week",
  ];
}
