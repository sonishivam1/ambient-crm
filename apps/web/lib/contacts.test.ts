import { describe, expect, it } from "vitest";

import { createContactInput, fullName } from "./contacts";

const base = { accountId: "northwind:CO-ACME-BT1", firstName: "Hannah" };

describe("contact input", () => {
  it("trims, lowercases the email and fills defaults", () => {
    const c = createContactInput.parse({ ...base, firstName: "  Hannah ", email: " Hannah.Brooks@ACME.example ", roles: ["buyer", "buyer"] });
    expect(c).toMatchObject({ firstName: "Hannah", lastName: "", email: "hannah.brooks@acme.example", phone: "", roles: ["buyer"], soldToAccountId: null });
  });

  it("treats an empty email or sold-to as none", () => {
    expect(createContactInput.parse({ ...base, email: "", soldToAccountId: "" })).toMatchObject({ email: null, soldToAccountId: null });
  });

  it("explains what's wrong", () => {
    const issue = (input: object) => createContactInput.safeParse(input).error?.issues[0]?.message;
    expect(issue({ ...base, firstName: " " })).toBe("Add a first name.");
    expect(issue({ ...base, email: "not-an-email" })).toBe("Enter a valid email address.");
    expect(issue({ ...base, phone: "call me" })).toBe("Phone numbers use digits, spaces, +, -, ( and ).");
    expect(issue({ firstName: "Hannah" })).toBeDefined();
  });

  it("accepts the phone formats people type", () => {
    for (const phone of ["0491 570 110", "+61 (2) 9000-0000", "021.555.0100"]) {
      expect(createContactInput.safeParse({ ...base, phone }).success).toBe(true);
    }
  });

  it("joins names without stray spaces", () => {
    expect(fullName({ firstName: "Hannah", lastName: "Brooks" })).toBe("Hannah Brooks");
    expect(fullName({ firstName: "Aroha", lastName: "" })).toBe("Aroha");
  });
});
