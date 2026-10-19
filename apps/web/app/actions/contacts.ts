"use server";

import { randomUUID } from "node:crypto";

import { refresh } from "next/cache";
import type { z } from "zod";

import { collection, getClient, type ClientSession, type Contact } from "@ambient/db";

import { audit } from "@/lib/audit";
import { PERSONAL_FIELDS, createContactInput, setContactActiveInput, updateContactInput, type ContactInput } from "@/lib/contacts";
import { getScope, type Scope } from "@/lib/data/scope";

export type ContactActionResult = { ok: true; id: string } | { ok: false; error: string };

const firstIssue = (e: z.ZodError) => e.issues[0]?.message ?? "Invalid input.";

/** Roles must be ones the tenant defines. */
function unknownRole(scope: Scope, roles: string[]) {
  const known = new Set(scope.user.tenant.contactRoles.map((r) => r.key));
  return roles.some((r) => !known.has(r));
}

/**
 * The bill-to (in scope, active) and, when given, a sold-to under it. Null when
 * either is missing or outside the user's scope, so nothing leaks.
 */
async function resolveAccounts(scope: Scope, input: ContactInput, session: ClientSession) {
  const accounts = await collection("accounts");
  const billTo = await accounts.findOne({ _id: input.accountId, ...scope.filter(), type: "bill_to", active: true }, { session });
  if (!billTo) return null;
  if (!input.soldToAccountId) return { billTo, soldToId: null };
  const soldTo = await accounts.findOne(
    { _id: input.soldToAccountId, ...scope.filter(), type: "sold_to", parentId: billTo._id, active: true },
    { session, projection: { _id: 1 } },
  );
  return soldTo ? { billTo, soldToId: soldTo._id } : null;
}

/** Emails are unique per tenant among contacts that aren't deleted. */
async function emailTaken(scope: Scope, email: string | null, exceptId: string | null, session: ClientSession) {
  if (!email) return false;
  const clash = await (await collection("contacts")).findOne(
    { ...scope.tenant(), email, deletedAt: null, ...(exceptId ? { _id: { $ne: exceptId } } : {}) },
    { session, projection: { _id: 1 } },
  );
  return !!clash;
}

/** Add a contact to a bill-to the user can see. */
export async function createContact(raw: unknown): Promise<ContactActionResult> {
  const parsed = createContactInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const input = parsed.data;
  const scope = await getScope();
  if (unknownRole(scope, input.roles)) return { ok: false, error: "Choose roles from the list." };

  const contacts = await collection("contacts");
  const client = await getClient();
  let result: ContactActionResult = { ok: false, error: "Account not found." };

  await client.withSession((session) =>
    session.withTransaction(async () => {
      const target = await resolveAccounts(scope, input, session);
      if (!target) {
        result = { ok: false, error: "Account not found." };
        return;
      }
      if (await emailTaken(scope, input.email, null, session)) {
        result = { ok: false, error: "Another contact already uses that email." };
        return;
      }
      const now = new Date();
      const doc: Contact = {
        _id: randomUUID(),
        tenantId: scope.tenantId,
        accountId: target.billTo._id,
        soldToAccountId: target.soldToId,
        ownerRepId: target.billTo.ownerRepId,
        division: target.billTo.division,
        firstName: input.firstName,
        lastName: input.lastName,
        jobTitle: input.jobTitle,
        email: input.email,
        phone: input.phone,
        roles: input.roles,
        active: true,
        createdByUserId: scope.user._id,
        updatedByUserId: scope.user._id,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
        deletedBy: null,
      };
      await contacts.insertOne(doc, { session });
      await audit(
        scope.user,
        {
          action: "contact.create",
          entity: "contact",
          entityId: doc._id,
          before: null,
          // Who the contact is stays out of the log; only where they sit and what they do.
          after: { accountId: doc.accountId, soldToAccountId: doc.soldToAccountId, roles: doc.roles, hasEmail: !!doc.email, hasPhone: !!doc.phone },
        },
        session,
      );
      result = { ok: true, id: doc._id };
    }),
  );
  if (result.ok) refresh();
  return result;
}

/** Edit a contact the user can see, including moving it to another bill-to they can see. */
export async function updateContact(raw: unknown): Promise<ContactActionResult> {
  const parsed = updateContactInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const { id, ...input } = parsed.data;
  const scope = await getScope();
  if (unknownRole(scope, input.roles)) return { ok: false, error: "Choose roles from the list." };

  const contacts = await collection("contacts");
  const client = await getClient();
  let result: ContactActionResult = { ok: false, error: "Contact not found." };

  await client.withSession((session) =>
    session.withTransaction(async () => {
      const before = await contacts.findOne({ _id: id, ...scope.filter(), deletedAt: null }, { session });
      if (!before) {
        result = { ok: false, error: "Contact not found." };
        return;
      }
      const target = await resolveAccounts(scope, input, session);
      if (!target) {
        result = { ok: false, error: "Account not found." };
        return;
      }
      if (await emailTaken(scope, input.email, id, session)) {
        result = { ok: false, error: "Another contact already uses that email." };
        return;
      }
      const next = {
        accountId: target.billTo._id,
        soldToAccountId: target.soldToId,
        ownerRepId: target.billTo.ownerRepId,
        division: target.billTo.division,
        firstName: input.firstName,
        lastName: input.lastName,
        jobTitle: input.jobTitle,
        email: input.email,
        phone: input.phone,
        roles: input.roles,
        updatedByUserId: scope.user._id,
        updatedAt: new Date(),
      };

      const changedBefore: Record<string, unknown> = {};
      const changedAfter: Record<string, unknown> = {};
      for (const key of ["accountId", "soldToAccountId"] as const) {
        if (before[key] !== next[key]) {
          changedBefore[key] = before[key];
          changedAfter[key] = next[key];
        }
      }
      if (before.roles.join() !== next.roles.join()) {
        changedBefore.roles = before.roles;
        changedAfter.roles = next.roles;
      }
      const personal = PERSONAL_FIELDS.filter((k) => (before[k] ?? "") !== (next[k] ?? ""));
      if (personal.length) changedAfter.personalFieldsChanged = personal;

      if (!Object.keys(changedAfter).length) {
        result = { ok: true, id };
        return;
      }
      await contacts.updateOne({ _id: id }, { $set: next }, { session });
      await audit(scope.user, { action: "contact.update", entity: "contact", entityId: id, before: changedBefore, after: changedAfter }, session);
      result = { ok: true, id };
    }),
  );
  if (result.ok) refresh();
  return result;
}

/** Deactivate (kept on history, dropped from pickers) or reactivate a contact. */
export async function setContactActive(raw: unknown): Promise<ContactActionResult> {
  const parsed = setContactActiveInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const { id, active } = parsed.data;
  const scope = await getScope();
  const contacts = await collection("contacts");
  const client = await getClient();
  let result: ContactActionResult = { ok: false, error: "Contact not found." };

  await client.withSession((session) =>
    session.withTransaction(async () => {
      const before = await contacts.findOne({ _id: id, ...scope.filter(), deletedAt: null }, { session });
      if (!before) return;
      result = { ok: true, id };
      if (before.active === active) return;
      await contacts.updateOne({ _id: id }, { $set: { active, updatedByUserId: scope.user._id, updatedAt: new Date() } }, { session });
      await audit(
        scope.user,
        { action: active ? "contact.reactivate" : "contact.deactivate", entity: "contact", entityId: id, before: { active: before.active }, after: { active } },
        session,
      );
    }),
  );
  if (result.ok) refresh();
  return result;
}
