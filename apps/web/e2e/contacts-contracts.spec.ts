/** Contacts (add one, find it) and contracts (the list and its renewal filter). */
import { unique } from "./support/dates";
import { expect, test } from "./support/test";

test("a rep adds a contact and finds it", async ({ page, signInAs }) => {
  await signInAs("rep");
  const last = `Tester${unique()}`;
  await page.goto("/contacts");
  await page.getByRole("button", { name: "Add contact" }).click();

  const dialog = page.getByRole("dialog", { name: "Add contact" });
  await dialog.getByRole("textbox", { name: "Search bill-to accounts" }).fill("delta");
  await dialog.getByRole("option", { name: /DELTA MINING SUPPLIES/ }).first().click();
  await dialog.getByLabel("First name").fill("Robin");
  await dialog.getByLabel("Last name").fill(last);
  await dialog.getByLabel("Job title").fill("Site Supervisor");
  await dialog.getByLabel("Email").fill(`robin.${last.toLowerCase()}@delta.example`);
  await dialog.getByRole("button", { name: "Add contact" }).click();

  await expect(page.getByText("Contact added")).toBeVisible();
  await expect(dialog).toBeHidden();
  await page.getByRole("searchbox", { name: "Search name, email, title or account" }).fill(last);
  await expect(page.getByRole("table").getByRole("row", { name: new RegExp(`Robin ${last}`) })).toBeVisible();
});

test("contracts list and the renewal filter", async ({ page, signInAs }) => {
  await signInAs("rep");
  await page.goto("/contracts");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("3 contracts");
  const table = page.getByRole("table");
  await expect(table.getByText("Hardware Retail Agreement")).toBeVisible();

  await page.getByRole("link", { name: /^≤ 30 days/ }).click();
  await expect(page).toHaveURL(/band=30/);
  await expect(table.getByText("National Safety Program")).toBeVisible();
  await expect(table.getByText("Hardware Retail Agreement")).toHaveCount(0);
});

test("another tenant never sees these contracts", async ({ page, signInAs }) => {
  await signInAs("harborRep");
  await page.goto("/contracts");
  await expect(page.getByRole("table")).toBeVisible();
  await expect(page.getByText("National Safety Program")).toHaveCount(0);
  await expect(page.getByText("Hardware Retail Agreement")).toHaveCount(0);
});
