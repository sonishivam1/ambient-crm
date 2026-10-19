import "server-only";

import { z } from "zod";

import { collection, type Contact } from "@ambient/db";

import { CONTACT_STATUSES, fullName } from "@/lib/contacts";

import { getScope, type Scope } from "./scope";

export const CONTACT_PAGE_SIZE = 25;

/** URL search params for /contacts, parsed leniently: anything invalid falls back to the default. */
export const contactsQuerySchema = z.object({
  q: z.string().trim().max(100).catch(""),
  /** A role key; checked against the tenant's roles when the query runs. */
  role: z.string().regex(/^[a-z0-9_-]{0,40}$/).catch(""),
  account: z.string().max(200).catch(""),
  status: z.enum(CONTACT_STATUSES).catch("active"),
  page: z.coerce.number().int().min(1).max(10_000).catch(1),
});
export type ContactsQuery = z.infer<typeof contactsQuerySchema>;

export type ContactRow = {
  id: string;
  accountId: string;
  account: string;
  accountCode: string;
  soldTo: { id: string; name: string; code: string } | null;
  firstName: string;
  lastName: string;
  name: string;
  jobTitle: string;
  email: string;
  phone: string;
  roles: string[];
  roleLabels: string[];
  active: boolean;
  updatedAt: Date;
};

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Contacts the user can see: those on bill-tos inside their scope and lens. */
function baseFilter(scope: Scope) {
  return { ...scope.filter(), deletedAt: null };
}

/** Account names and codes, and role labels from the tenant, for a page of contacts. */
async function decorate(scope: Scope, contacts: Contact[]): Promise<ContactRow[]> {
  const ids = [...new Set(contacts.flatMap((c) => [c.accountId, ...(c.soldToAccountId ? [c.soldToAccountId] : [])]))];
  const accounts = await (await collection("accounts"))
    .find({ ...scope.tenant(), _id: { $in: ids } }, { projection: { name: 1, code: 1 } })
    .toArray();
  const byId = new Map(accounts.map((a) => [a._id, a]));
  const roleLabel = new Map(scope.user.tenant.contactRoles.map((r) => [r.key, r.label]));
  return contacts.map((c) => {
    const account = byId.get(c.accountId);
    const soldTo = c.soldToAccountId ? byId.get(c.soldToAccountId) : undefined;
    return {
      id: c._id,
      accountId: c.accountId,
      account: account?.name ?? "",
      accountCode: account?.code ?? "",
      soldTo: soldTo ? { id: soldTo._id, name: soldTo.name, code: soldTo.code } : null,
      firstName: c.firstName,
      lastName: c.lastName,
      name: fullName(c),
      jobTitle: c.jobTitle,
      email: c.email ?? "",
      phone: c.phone,
      roles: c.roles,
      roleLabels: c.roles.map((r) => roleLabel.get(r) ?? r),
      active: c.active,
      updatedAt: c.updatedAt,
    };
  });
}

/**
 * Every word must appear in the name, email or job title ("hannah brooks"
 * finds Hannah Brooks); or the whole query matches the bill-to's name or code.
 */
async function textMatch(scope: Scope, q: string) {
  const words = q.split(/\s+/).filter(Boolean).slice(0, 6);
  const fields = ["firstName", "lastName", "email", "jobTitle"];
  const byWords = { $and: words.map((w) => ({ $or: fields.map((f) => ({ [f]: new RegExp(escapeRegex(w), "i") })) })) };
  const pattern = new RegExp(escapeRegex(q), "i");
  const accountIds = await (await collection("accounts")).distinct("_id", {
    ...scope.filter(),
    type: "bill_to",
    $or: [{ name: pattern }, { code: pattern }],
  });
  return accountIds.length ? { $or: [byWords, { accountId: { $in: accountIds } }] } : byWords;
}

/** The directory: filtered, sorted by name and paged with one aggregation. */
export async function getContactsPage(query: ContactsQuery) {
  const scope = await getScope();
  const and: Record<string, unknown>[] = [];
  if (query.status !== "all") and.push({ active: query.status === "active" });
  if (query.role) {
    // A role the tenant doesn't have matches nothing.
    const known = scope.user.tenant.contactRoles.some((r) => r.key === query.role);
    and.push({ roles: known ? query.role : { $in: [] } });
  }
  if (query.account) and.push({ accountId: query.account });
  if (query.q) and.push(await textMatch(scope, query.q));

  const [result] = await (await collection("contacts"))
    .aggregate<{ rows: Contact[]; total: { n: number }[] }>([
      { $match: { ...baseFilter(scope), ...(and.length ? { $and: and } : {}) } },
      {
        $facet: {
          rows: [{ $sort: { lastName: 1, firstName: 1, _id: 1 } }, { $skip: (query.page - 1) * CONTACT_PAGE_SIZE }, { $limit: CONTACT_PAGE_SIZE }],
          total: [{ $count: "n" }],
        },
      },
    ])
    .toArray();
  const total = result?.total[0]?.n ?? 0;
  return {
    rows: await decorate(scope, result?.rows ?? []),
    total,
    pages: Math.max(1, Math.ceil(total / CONTACT_PAGE_SIZE)),
  };
}

/** Filter options and dialog settings, all inside the user's scope. */
export async function getContactOptions() {
  const scope = await getScope();
  const accountIds = await (await collection("contacts")).distinct("accountId", baseFilter(scope));
  const accounts = await (await collection("accounts"))
    .find({ ...scope.tenant(), _id: { $in: accountIds } }, { projection: { name: 1 } })
    .sort({ name: 1 })
    .toArray();
  return {
    accounts: accounts.map((a) => ({ id: a._id, name: a.name })),
    roles: scope.user.tenant.contactRoles,
    timeZone: scope.timeZone,
  };
}

export type ContactOptions = Awaited<ReturnType<typeof getContactOptions>>;

/**
 * Active contacts for a customer profile. A bill-to shows all of its contacts;
 * a sold-to shows the ones at that site plus the bill-to's account-wide ones.
 */
export async function getAccountContacts(scope: Scope, account: { _id: string; type: "bill_to" | "sold_to"; parentId: string | null }) {
  const filter =
    account.type === "bill_to"
      ? { accountId: account._id }
      : { accountId: account.parentId ?? "", soldToAccountId: { $in: [account._id, null] } };
  const contacts = await (await collection("contacts"))
    .find({ ...baseFilter(scope), ...filter, active: true })
    .sort({ lastName: 1, firstName: 1, _id: 1 })
    .limit(50)
    .toArray();
  return decorate(scope, contacts);
}
