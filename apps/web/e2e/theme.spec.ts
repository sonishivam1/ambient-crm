/** Light and dark mode: the switch changes it and it survives a reload. */
import { expect, test } from "./support/test";

test("dark mode toggles and is remembered", async ({ page, signInAs }) => {
  await signInAs("rep");
  await page.goto("/");
  const html = page.locator("html");
  const toggle = page.getByRole("switch", { name: "Dark mode" });
  await expect(toggle).not.toBeChecked();
  await expect(html).not.toHaveAttribute("data-dark", "1");

  await toggle.click();
  await expect(toggle).toBeChecked();
  await expect(html).toHaveAttribute("data-dark", "1");
  const darkBackground = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);

  await page.reload();
  await expect(html).toHaveAttribute("data-dark", "1");
  await expect(page.getByRole("switch", { name: "Dark mode" })).toBeChecked();

  await page.getByRole("switch", { name: "Dark mode" }).click();
  await expect(html).toHaveAttribute("data-dark", "0");
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).not.toBe(darkBackground);
});
