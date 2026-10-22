/** Notifications: the unread badge, marking one read, then all. (Grace: no other test touches hers.) */
import { expect, test } from "./support/test";

test("mark one read, then all", async ({ page, signInAs }) => {
  await signInAs("senior");
  await page.goto("/");
  const bell = page.getByRole("banner").getByRole("link", { name: /^Notifications/ });
  const before = Number(/(\d+) unread/.exec((await bell.getAttribute("aria-label")) ?? "")?.[1] ?? 0);
  expect(before).toBeGreaterThan(1);

  await bell.click();
  await expect(page).toHaveURL(/\/notifications/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(`${before} unread`);

  await page.getByRole("button", { name: "Mark read" }).first().click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText(`${before - 1} unread`);

  await page.getByRole("button", { name: "Mark all read" }).click();
  await expect(page.getByRole("button", { name: "Mark read" })).toHaveCount(0);
  await expect(bell).toHaveAccessibleName("Notifications");
});
