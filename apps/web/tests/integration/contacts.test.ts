import { describe, expect, it } from "vitest";

import { collection } from "@ambient/db";

import { listSoldTos } from "@/app/actions/accounts";
import { createContact, setContactActive, updateContact } from "@/app/actions/contacts";
import { paletteSearch } from "@/app/actions/search";
import { getAccountProfile } from "@/lib/data/account-profile";
import { contactsQuerySchema, getContactOptions, getContactsPage } from "@/lib/data/contacts";

import { USERS, signInAs } from "../support/session";

const query = (params: Record<string, string> = {}) => contactsQuerySchema.parse(params);
const names = async (params: Record<string, string> = {}) => (await getContactsPage(query(params))).rows.map((r) => r.name);

async function auditFor(entityId: string) {
  return (await collection("auditLog")).find({ entityId }).sort({ at: 1 }).toArray();
}
async function contactByEmail(email: string) {
  return (await collection("contacts")).findOne({ email });
}

// Priya (rep r1) owns ACME SAFETY, HARROW and DELTA: 7 contacts, 1 of them inactive.
describe("contact directory", () => {
  it("shows a rep only contacts on their own accounts, active first by default", async () => {
    signInAs(USERS.northwind.rep);
    // Sorted by last name.
    expect(await names()).toEqual(["Hannah Brooks", "Tessa Doyle", "Ben Fletcher", "Olivia Grant", "Marcus Lee", "Kate Sullivan"]);
    expect(await names({ status: "inactive" })).toEqual(["Raj Malhotra"]);
    expect((await getContactsPage(query({ status: "all" }))).total).toBe(7);
  });

  it("gives a manager their team's contacts", async () => {
    signInAs(USERS.northwind.manager);
    expect((await getContactsPage(query({ status: "all" }))).total).toBe(14);
    expect((await getContactsPage(query())).total).toBe(12);
  });

  it("applies the division lens", async () => {
    signInAs(USERS.northwind.senior, "wholesale");
    expect((await names()).sort()).toEqual(["Ben Fletcher", "Chris Nolan", "Daniel Wu", "Jack Hamilton", "Olivia Grant", "Aroha Ngata"].sort());
  });

  it("keeps tenants apart, even for the same name and email", async () => {
    signInAs(USERS.harbor.rep);
    const page = await getContactsPage(query({ q: "hannah brooks" }));
    expect(page.rows).toHaveLength(1);
    expect(page.rows[0]).toMatchObject({ account: "ACME ELECTRICAL NZ", jobTitle: "Purchasing Officer" });

    signInAs(USERS.northwind.admin); // admins see no accounts, so no contacts
    expect((await getContactsPage(query({ status: "all" }))).total).toBe(0);
  });

  it("searches full names, emails, job titles and account names", async () => {
    signInAs(USERS.northwind.rep);
    expect(await names({ q: "hannah brooks" })).toEqual(["Hannah Brooks"]);
    expect(await names({ q: "marcus.lee@" })).toEqual(["Marcus Lee"]);
    expect(await names({ q: "finance controller" })).toEqual(["Marcus Lee"]);
    expect((await names({ q: "harrow" })).sort()).toEqual(["Ben Fletcher", "Olivia Grant"]);
    expect(await names({ q: "daniel wu" })).toEqual([]); // Liam's contact
  });

  it("filters by the tenant's roles and by account, and labels roles from the tenant", async () => {
    signInAs(USERS.northwind.rep);
    expect((await names({ role: "buyer" })).sort()).toEqual(["Hannah Brooks", "Olivia Grant"]);
    expect(await names({ role: "facilities" })).toEqual([]); // Harbor's role, not Northwind's
    expect((await names({ account: "northwind:CG-HARROW-BT1" })).sort()).toEqual(["Ben Fletcher", "Olivia Grant"]);

    const tessa = (await getContactsPage(query({ q: "tessa" }))).rows[0]!;
    expect(tessa.roleLabels).toEqual(["Safety", "Operations"]);
    expect(tessa.soldTo?.id).toBe("northwind:CO-ACME-BT1-ST2");

    const options = await getContactOptions();
    expect(options.roles.map((r) => r.key)).toEqual(["buyer", "finance", "safety", "warehouse", "operations"]);
    expect(options.accounts.map((a) => a.name).sort()).toEqual(["ACME SAFETY", "DELTA MINING SUPPLIES", "HARROW HARDWARE GROUP"]);
  });

  it("shows a bill-to's active contacts on its profile, and a sold-to's site and account-wide ones", async () => {
    signInAs(USERS.northwind.rep);
    const billTo = await getAccountProfile("northwind:CO-ACME-BT1");
    expect(billTo!.contacts.map((c) => c.name)).toEqual(["Hannah Brooks", "Tessa Doyle", "Marcus Lee"]); // Raj is inactive
    const soldTo = await getAccountProfile("northwind:CO-ACME-BT1-ST1");
    expect(soldTo!.contacts.map((c) => c.name).sort()).toEqual(["Hannah Brooks", "Marcus Lee"]);
  });

  it("finds contacts in the Ctrl K palette, only inside scope", async () => {
    signInAs(USERS.northwind.rep);
    const found = (await paletteSearch("hannah")).filter((r) => r.kind === "contact");
    expect(found).toEqual([expect.objectContaining({ title: "Hannah Brooks", href: "/accounts/northwind%3ACO-ACME-BT1", subtitle: "Procurement Manager · ACME SAFETY" })]);
    expect((await paletteSearch("aaron holt")).filter((r) => r.kind === "contact")).toEqual([]);
    expect((await paletteSearch("raj")).filter((r) => r.kind === "contact")).toEqual([]); // inactive
  });

  it("lists sold-to sites only under a bill-to in scope", async () => {
    signInAs(USERS.northwind.rep);
    expect((await listSoldTos("northwind:CO-ACME-BT1")).length).toBeGreaterThanOrEqual(2);
    expect(await listSoldTos("northwind:CG-BRIGHTWELL-BT1")).toEqual([]);
  });
});

describe("adding contacts", () => {
  const base = { accountId: "northwind:SA-DELTA-BT1", lastName: "Quinn", jobTitle: "Buyer", phone: "0491 570 199", roles: ["buyer"] };

  it("adds a contact with the account's owner and division, and audits it without personal details", async () => {
    signInAs(USERS.northwind.rep);
    const result = await createContact({ ...base, firstName: "Dana", email: " Dana.Quinn@Delta.example ", soldToAccountId: "northwind:SA-DELTA-BT1-ST1" });
    expect(result.ok).toBe(true);
    const doc = await contactByEmail("dana.quinn@delta.example");
    expect(doc).toMatchObject({
      tenantId: "northwind",
      accountId: "northwind:SA-DELTA-BT1",
      soldToAccountId: "northwind:SA-DELTA-BT1-ST1",
      ownerRepId: "northwind:r1",
      division: "uniforms",
      active: true,
      createdByUserId: USERS.northwind.rep,
    });

    const [row] = await auditFor(doc!._id);
    expect(row).toMatchObject({ action: "contact.create", tenantId: "northwind", actorUserId: USERS.northwind.rep });
    expect(row!.after).toEqual({ accountId: "northwind:SA-DELTA-BT1", soldToAccountId: "northwind:SA-DELTA-BT1-ST1", roles: ["buyer"], hasEmail: true, hasPhone: true });
    const text = JSON.stringify(row);
    for (const secret of ["Dana", "Quinn", "dana.quinn", "0491 570 199"]) expect(text).not.toContain(secret);
  });

  it("refuses accounts outside the user's scope or tenant, and sites from another bill-to", async () => {
    signInAs(USERS.northwind.rep);
    expect(await createContact({ ...base, firstName: "Out", accountId: "northwind:CG-BRIGHTWELL-BT1" })).toEqual({ ok: false, error: "Account not found." });
    expect(await createContact({ ...base, firstName: "Mixed", soldToAccountId: "northwind:CG-HARROW-BT1-ST1" })).toEqual({ ok: false, error: "Account not found." });
    expect(await createContact({ ...base, firstName: "Site", accountId: "northwind:CO-ACME-BT1-ST1" })).toEqual({ ok: false, error: "Account not found." });

    signInAs(USERS.harbor.super);
    expect(await createContact({ ...base, firstName: "Cross" })).toEqual({ ok: false, error: "Account not found." });
    expect(await (await collection("contacts")).countDocuments({ firstName: { $in: ["Out", "Mixed", "Site", "Cross"] } })).toBe(0);
  });

  it("only takes the tenant's roles and valid details", async () => {
    signInAs(USERS.northwind.rep);
    expect(await createContact({ ...base, firstName: "Role", roles: ["facilities"] })).toEqual({ ok: false, error: "Choose roles from the list." });
    expect(await createContact({ ...base, firstName: "", email: "" })).toEqual({ ok: false, error: "Add a first name." });
    expect(await createContact({ ...base, firstName: "Mail", email: "nope" })).toEqual({ ok: false, error: "Enter a valid email address." });
  });

  it("refuses an email another contact in the tenant uses, but not one only another tenant uses", async () => {
    signInAs(USERS.northwind.rep);
    // Daniel Wu is Liam's contact: still a clash, because emails are unique per tenant.
    expect(await createContact({ ...base, firstName: "Dupe", email: "daniel.wu@brightwell.example" })).toEqual({
      ok: false,
      error: "Another contact already uses that email.",
    });

    signInAs(USERS.harbor.rep);
    const result = await createContact({ accountId: "harbor:CO-ACME-BT1", firstName: "Marcus", lastName: "Lee", email: "marcus.lee@acme.example" });
    expect(result.ok).toBe(true);
  });
});

describe("editing contacts", () => {
  it("moves a contact to another account the user can see and records what changed, not the values", async () => {
    signInAs(USERS.northwind.rep);
    const kate = (await contactByEmail("kate.sullivan@delta.example"))!;
    const result = await updateContact({
      id: kate._id,
      accountId: "northwind:CG-HARROW-BT1",
      firstName: "Katherine",
      lastName: "Sullivan",
      jobTitle: "Warehouse Lead",
      email: "kate.sullivan@delta.example",
      phone: kate.phone,
      roles: ["warehouse", "operations"],
    });
    expect(result).toEqual({ ok: true, id: kate._id });

    const after = (await (await collection("contacts")).findOne({ _id: kate._id }))!;
    expect(after).toMatchObject({ accountId: "northwind:CG-HARROW-BT1", soldToAccountId: null, division: "wholesale", firstName: "Katherine" });

    const row = (await auditFor(kate._id)).find((r) => r.action === "contact.update")!;
    expect(row.before).toEqual({ accountId: "northwind:SA-DELTA-BT1", soldToAccountId: "northwind:SA-DELTA-BT1-ST1", roles: ["warehouse"] });
    expect(row.after).toEqual({
      accountId: "northwind:CG-HARROW-BT1",
      soldToAccountId: null,
      roles: ["warehouse", "operations"],
      personalFieldsChanged: ["firstName"],
    });
    expect(JSON.stringify(row)).not.toContain("Katherine");
  });

  it("writes nothing when nothing changed", async () => {
    signInAs(USERS.northwind.rep);
    const ben = (await contactByEmail("ben.fletcher@harrow.example"))!;
    const { _id, accountId, soldToAccountId, firstName, lastName, jobTitle, email, phone, roles } = ben;
    expect(await updateContact({ id: _id, accountId, soldToAccountId, firstName, lastName, jobTitle, email, phone, roles })).toEqual({ ok: true, id: _id });
    expect(await auditFor(_id)).toEqual([]);
  });

  it("will not edit a contact outside the user's scope or tenant, or take another contact's email", async () => {
    const daniel = (await contactByEmail("daniel.wu@brightwell.example"))!;
    const edit = { id: daniel._id, accountId: daniel.accountId, firstName: "Changed" };

    signInAs(USERS.northwind.rep);
    expect(await updateContact(edit)).toEqual({ ok: false, error: "Contact not found." });
    signInAs(USERS.harbor.super);
    expect(await updateContact(edit)).toEqual({ ok: false, error: "Contact not found." });

    signInAs(USERS.northwind.manager);
    expect(await updateContact({ ...edit, firstName: "Daniel", lastName: "Wu", email: "marcus.lee@acme.example" })).toEqual({
      ok: false,
      error: "Another contact already uses that email.",
    });
    expect((await (await collection("contacts")).findOne({ _id: daniel._id }))!.firstName).toBe("Daniel");
  });

  it("deactivates and reactivates, with an audit row each way", async () => {
    signInAs(USERS.northwind.rep);
    const olivia = (await contactByEmail("olivia.grant@harrow.example"))!;
    expect(await setContactActive({ id: olivia._id, active: false })).toEqual({ ok: true, id: olivia._id });
    expect(await names()).not.toContain("Olivia Grant");
    expect(await names({ status: "inactive" })).toContain("Olivia Grant");
    expect((await getAccountProfile("northwind:CG-HARROW-BT1"))!.contacts.map((c) => c.name)).not.toContain("Olivia Grant");

    expect(await setContactActive({ id: olivia._id, active: true })).toEqual({ ok: true, id: olivia._id });
    expect((await auditFor(olivia._id)).map((r) => r.action)).toEqual(["contact.deactivate", "contact.reactivate"]);

    signInAs(USERS.harbor.rep);
    expect(await setContactActive({ id: olivia._id, active: false })).toEqual({ ok: false, error: "Contact not found." });
  });
});
