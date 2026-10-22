/** Call cycle: plan a visit, report on one that has happened. */
import { isoDayFromToday, unique } from "./support/dates";
import { expect, test } from "./support/test";

test.beforeEach(async ({ signInAs }) => signInAs("rep"));

test("a rep plans a visit and it appears in the call cycle", async ({ page }) => {
  const purpose = `E2E fit-testing day ${unique()}`;
  await page.goto("/call-cycle");
  await page.getByRole("button", { name: "Plan visit" }).click();

  const dialog = page.getByRole("dialog", { name: "Plan a visit" });
  await dialog.getByRole("textbox", { name: "Search bill-to accounts" }).fill("harrow");
  await dialog.getByRole("option", { name: /HARROW HARDWARE GROUP/ }).first().click();
  await dialog.getByLabel("Date").fill(isoDayFromToday(5));
  await dialog.getByLabel("Time").fill("10:30");
  await dialog.getByLabel("Visit type").selectOption("site");
  await dialog.getByLabel("Purpose").fill(purpose);
  await dialog.getByRole("button", { name: "Plan visit" }).click();

  await expect(page.getByText("Visit planned")).toBeVisible();
  await expect(dialog).toBeHidden();
  await expect(page.getByText(purpose)).toBeVisible();
});

test("a rep reports on a past visit", async ({ page }) => {
  await page.goto("/call-cycle");
  // The seeded visit two days ago, still to be reported.
  await page.getByRole("button", { name: "Complete" }).first().click();

  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Sentiment").selectOption("positive");
  for (const rating of ["Relationship", "Commercial outlook", "Service"]) {
    await dialog.getByRole("radiogroup", { name: rating }).getByRole("radio", { name: "4" }).click();
  }
  await dialog.getByLabel("Key points").fill("Walked the dock; pallets 3 and 4 tracked.");
  await dialog.getByRole("button", { name: "Complete visit" }).click();

  await expect(page.getByText("Visit report captured")).toBeVisible();
  await expect(dialog).toBeHidden();
});
