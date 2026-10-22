/** Accounts: the list, search, a customer group, a bill-to profile, logging an interaction. */
import { expect, test } from "./support/test";

test.beforeEach(async ({ signInAs }) => signInAs("rep"));

test("search narrows the list", async ({ page }) => {
  await page.goto("/accounts");
  const rows = page.getByRole("table").getByRole("link", { name: /HARROW|ACME|DELTA/ });
  await expect(rows).toHaveCount(3);
  await page.getByRole("searchbox", { name: "Search name or code" }).fill("acme");
  await expect(page).toHaveURL(/q=acme/);
  await expect(rows).toHaveCount(1);
  await expect(page.getByRole("table").getByRole("link", { name: "ACME SAFETY", exact: true })).toBeVisible();
});

test("from the list to a group to a bill-to profile", async ({ page }) => {
  await page.goto("/accounts");
  await page.getByRole("table").getByRole("link", { name: "ACME SAFETY", exact: true }).click();

  await expect(page).toHaveURL(/\/accounts\/group\//);
  await expect(page.getByRole("heading", { name: "ACME SAFETY", level: 1 })).toBeVisible();
  await expect(page.getByText("3 bill-to · 8 sold-to")).toBeVisible();

  await page.getByRole("table").getByRole("link", { name: "ACME SAFETY", exact: true }).click();
  await expect(page).toHaveURL(/\/accounts\/northwind%3ACO-ACME-BT1$/);
  await expect(page.getByRole("heading", { name: "ACME SAFETY", level: 1 })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Timeline" })).toBeVisible();
  await expect(page.getByText("Buyer chased an ETA on pallets 3 and 4").first()).toBeVisible();

  await page.getByRole("navigation", { name: "Account sections" }).getByRole("link", { name: /^Tasks/ }).click();
  await expect(page).toHaveURL(/tab=tasks/);
  await expect(page.getByText("Schedule executive check-in")).toBeVisible();
});

test("logging an interaction adds it to the timeline", async ({ page }) => {
  const summary = `E2E call: buyer confirmed the boot sizes ${Math.random().toString(36).slice(2, 7)}`;
  await page.goto("/accounts/northwind%3ASA-DELTA-BT1");
  await page.getByRole("button", { name: "Log interaction" }).click();

  const dialog = page.getByRole("dialog", { name: "Log an interaction" });
  await dialog.getByRole("radiogroup", { name: "Interaction type" }).getByRole("radio", { name: "Call" }).click();
  await dialog.getByLabel("What happened?").fill(summary);
  await dialog.getByRole("button", { name: "Log interaction" }).click();

  await expect(page.getByText("Interaction logged")).toBeVisible();
  await expect(dialog).toBeHidden();
  await expect(page.getByText(summary).first()).toBeVisible();
});
