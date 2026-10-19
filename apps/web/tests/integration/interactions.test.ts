import { describe, expect, it } from "vitest";

import { collection } from "@ambient/db";

import { logInteraction } from "@/app/actions/interactions";
import { getAccountProfile } from "@/lib/data/account-profile";

import { USERS, signInAs } from "../support/session";

describe("logging interactions", () => {
  it("logs a call on the timeline and audits it without the text", async () => {
    signInAs(USERS.northwind.rep);
    const summary = "Buyer shared confidential volume numbers";
    expect(await logInteraction({ accountId: "northwind:CO-ACME-BT1", type: "call", summary })).toEqual({ ok: true });

    const saved = await (await collection("interactions")).findOne({ summary });
    expect(saved).toMatchObject({ tenantId: "northwind", type: "call", authorUserId: USERS.northwind.rep, division: "uniforms" });

    const [audit] = await (await collection("auditLog")).find({ entityId: saved!._id }).toArray();
    expect(audit).toMatchObject({ action: "interaction.log", after: { accountId: "northwind:CO-ACME-BT1", type: "call" } });
    expect(JSON.stringify(audit)).not.toContain("confidential");

    const profile = await getAccountProfile("northwind:CO-ACME-BT1");
    expect(profile!.timeline[0]).toMatchObject({ kind: "interaction", body: summary, by: "Priya Nair" });
  });

  it("writes nothing for an account outside the user's scope", async () => {
    signInAs(USERS.northwind.rep);
    const before = await (await collection("interactions")).countDocuments();
    expect(await logInteraction({ accountId: "northwind:CG-BRIGHTWELL-BT1", type: "note", summary: "x" })).toEqual({
      ok: false,
      error: "Account not found.",
    });
    expect(await (await collection("interactions")).countDocuments()).toBe(before);
  });

  it("rejects an empty summary and unknown types", async () => {
    signInAs(USERS.northwind.rep);
    expect(await logInteraction({ accountId: "northwind:CO-ACME-BT1", type: "note", summary: "   " })).toEqual({
      ok: false,
      error: "Add a short summary.",
    });
    expect((await logInteraction({ accountId: "northwind:CO-ACME-BT1", type: "email", summary: "hi" })).ok).toBe(false);
  });
});
