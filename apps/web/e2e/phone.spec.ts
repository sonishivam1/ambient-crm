/** Phone width (the "phone" project, 390 × 844): pages fit and the navigation opens. */
import { expect, expectNoHorizontalScroll, test } from "./support/test";

const PAGES = ["/", "/accounts", "/accounts/group/northwind%3ACO-ACME", "/accounts/northwind%3ACO-ACME-BT1", "/tasks", "/call-cycle", "/contacts", "/contracts", "/notifications", "/assistant"];

test.beforeEach(async ({ signInAs }) => signInAs("rep"));

for (const path of PAGES) {
  test(`${path} fits a phone screen`, async ({ page }) => {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expectNoHorizontalScroll(page);
  });
}

test("the menu opens the navigation", async ({ page }) => {
  await page.goto("/");
  const nav = page.getByRole("navigation", { name: "Main" });
  await expect(nav.getByRole("link", { name: /^Tasks/ })).not.toBeInViewport();
  await page.getByRole("button", { name: "Menu" }).click();
  await nav.getByRole("link", { name: /^Tasks/ }).click();
  await expect(page).toHaveURL(/\/tasks$/);
  await expect(page.getByRole("heading", { name: "Your tasks" })).toBeVisible();
});
