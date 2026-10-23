/** The app shell: the sidebar stays put and fits the screen; admin tools sit behind one menu. */
import { expect, test } from "./support/test";

for (const height of [900, 768, 700]) {
  test(`the sidebar fits a ${height}px-tall screen without scrolling, even for a super admin`, async ({ page, signInAs }) => {
    await signInAs("super");
    await page.setViewportSize({ width: 1280, height });
    await page.goto("/");
    const nav = page.getByRole("navigation", { name: "Main" });
    await expect(nav.getByRole("link", { name: "CRM usage" })).toBeInViewport();
    const fits = await nav.evaluate((el) => el.scrollHeight <= el.clientHeight);
    expect(fits, "the sidebar scrolls").toBe(true);
  });
}

test("the sidebar stays in place while the page scrolls", async ({ page, signInAs }) => {
  await signInAs("rep");
  await page.goto("/");
  const nav = page.getByRole("navigation", { name: "Main" });
  const before = await nav.boundingBox();
  await page.mouse.wheel(0, 1500);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  expect(await nav.boundingBox()).toEqual(before);
});

test("admins open their tools from the Admin menu", async ({ page, signInAs }) => {
  await signInAs("admin");
  await page.goto("/");
  await page.getByRole("button", { name: "Admin · Dev" }).click();
  const menu = page.getByRole("menu");
  await expect(menu.getByRole("menuitem", { name: "Audit log" })).toBeVisible();
  await menu.getByRole("menuitem", { name: "AI usage" }).click();
  await expect(page).toHaveURL(/\/admin\/ai$/);
  await expect(page.getByRole("heading", { name: "AI usage", level: 1 })).toBeVisible();
});

test("non-admins have no Admin menu", async ({ page, signInAs }) => {
  await signInAs("lead");
  await page.goto("/");
  await expect(page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Team overview" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Admin · Dev" })).toHaveCount(0);
});
