/** Each role signs in and sees what its role allows: no more, no less. */
import { USERS, expect, test, type UserKey } from "./support/test";

const VISIBLE: [UserKey, number, string[], string[]][] = [
  // [user, customer groups, sees, never sees]
  ["rep", 3, ["HARROW HARDWARE GROUP", "ACME SAFETY"], ["BRIGHTWELL HOME SUPPLY (WA)", "CASTLEFORD INDUSTRIAL"]],
  ["manager", 10, ["HARROW HARDWARE GROUP", "BRIGHTWELL HOME SUPPLY (WA)"], ["CASTLEFORD INDUSTRIAL", "SKYBRIDGE AVIATION"]],
  ["senior", 15, ["CASTLEFORD INDUSTRIAL", "SKYBRIDGE AVIATION"], ["BLUEWATER MARINE SUPPLY"]],
  ["lead", 15, ["CASTLEFORD INDUSTRIAL", "HARBOUR CITY COUNCIL"], ["BLUEWATER MARINE SUPPLY"]],
  ["super", 15, ["CASTLEFORD INDUSTRIAL"], ["BLUEWATER MARINE SUPPLY"]],
  ["admin", 0, [], ["HARROW HARDWARE GROUP"]],
  ["harborRep", 2, ["BLUEWATER MARINE SUPPLY", "ACME ELECTRICAL NZ"], ["HARROW HARDWARE GROUP", "ACME SAFETY"]],
];

for (const [user, groups, sees, neverSees] of VISIBLE) {
  test(`${user} sees their dashboard and only the accounts their role allows`, async ({ page, signInAs }) => {
    await signInAs(user);
    const { name } = USERS[user];
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(new RegExp(`^Good \\w+, ${name.split(" ")[0]}$`));
    await expect(page.getByRole("banner").getByRole("button", { name: new RegExp(name) })).toBeVisible();

    await page.goto("/accounts");
    await expect(page.getByRole("heading", { level: 1 })).toContainText(`${groups} customer groups`);
    const table = page.getByRole("table");
    for (const group of sees) await expect(table.getByRole("link", { name: group, exact: true })).toBeVisible();
    for (const group of neverSees) await expect(table.getByRole("link", { name: group, exact: true })).toHaveCount(0);
  });
}

test("a rep can't open another rep's account by its address", async ({ page, signInAs }) => {
  await signInAs("rep");
  await page.goto("/accounts/northwind%3ACG-BRIGHTWELL-BT1");
  await expect(page.getByRole("heading", { name: "Account not found", level: 1 })).toBeVisible();
  await expect(page.getByText("BRIGHTWELL")).toHaveCount(0);
});

test("admin pages are not found for non-admins and open for admins", async ({ page, signInAs }) => {
  for (const user of ["rep", "manager", "lead"] as const) {
    await signInAs(user);
    await page.goto("/admin/ai");
    await expect(page.getByRole("heading", { name: "404" })).toBeVisible();
  }
  await signInAs("admin");
  await page.goto("/admin/ai");
  await expect(page.getByRole("heading", { name: "AI usage", level: 1 })).toBeVisible();
});

test("the development role switcher signs in as someone else", async ({ page, signInAs }) => {
  await signInAs("rep");
  await page.goto("/");
  await page.getByRole("button", { name: "Development: switch role" }).click();
  await page.getByRole("menuitem", { name: /Liam Carter/ }).click();
  await expect(page.getByRole("banner").getByRole("button", { name: /Liam Carter/ })).toBeVisible();
  await page.goto("/accounts");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("10 customer groups");
});
