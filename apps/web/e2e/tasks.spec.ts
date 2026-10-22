/** Tasks: create one through the form, find it, complete it; a manager assigns one to a rep. */
import { isoDayFromToday, unique } from "./support/dates";
import { expect, test } from "./support/test";

test("a rep creates a task due today and marks it complete", async ({ page, signInAs }) => {
  await signInAs("rep");
  const title = `E2E call back about boots ${unique()}`;
  await page.goto("/tasks");
  await page.getByRole("button", { name: "Add task" }).click();

  const dialog = page.getByRole("dialog", { name: "New task" });
  await dialog.getByRole("textbox", { name: "Search bill-to accounts" }).fill("delta");
  await dialog.getByRole("option", { name: /DELTA MINING SUPPLIES/ }).first().click();
  await dialog.getByLabel("Title").fill(title);
  await dialog.getByLabel("Due date").fill(isoDayFromToday(0));
  await dialog.getByLabel("Priority").selectOption("high");
  await dialog.getByRole("button", { name: "Create task" }).click();

  await expect(page.getByText("Task created")).toBeVisible();
  await expect(dialog).toBeHidden();
  await expect(page.getByText(title)).toBeVisible();

  await page.getByRole("button", { name: `Mark "${title}" complete` }).click();
  await expect(page.getByText("Task completed")).toBeVisible();
  await page.goto("/tasks?view=all");
  await expect(page.getByRole("button", { name: `Mark "${title}" complete` })).toHaveCount(0);
});

test("the form can't be sent without a title", async ({ page, signInAs }) => {
  await signInAs("rep");
  await page.goto("/tasks");
  await page.getByRole("button", { name: "Add task" }).click();
  const dialog = page.getByRole("dialog", { name: "New task" });
  await dialog.getByRole("textbox", { name: "Search bill-to accounts" }).fill("harrow");
  await dialog.getByRole("option", { name: /HARROW HARDWARE GROUP/ }).first().click();
  await dialog.getByLabel("Due date").fill(isoDayFromToday(1));
  const create = dialog.getByRole("button", { name: "Create task" });
  await expect(create).toBeDisabled();
  await dialog.getByLabel("Title").fill("   ");
  await expect(create).toBeDisabled();
  await dialog.getByLabel("Title").fill("Check the fit-test results");
  await expect(create).toBeEnabled();
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toBeHidden();
});

test("a manager assigns a task to a rep, who sees it and is notified", async ({ page, signInAs }) => {
  await signInAs("manager");
  const title = `E2E confirm roll-out dates ${unique()}`;
  await page.goto("/tasks");
  await page.getByRole("button", { name: "Add task" }).click();

  const dialog = page.getByRole("dialog", { name: "New task" });
  await dialog.getByRole("textbox", { name: "Search bill-to accounts" }).fill("harrow");
  await dialog.getByRole("option", { name: /HARROW HARDWARE GROUP/ }).first().click();
  await dialog.getByRole("checkbox", { name: /Priya Nair/ }).check();
  await dialog.getByLabel("Title").fill(title);
  await dialog.getByLabel("Due date").fill(isoDayFromToday(3));
  await dialog.getByRole("button", { name: "Create task" }).click();
  await expect(page.getByText("Task created")).toBeVisible();

  await signInAs("rep");
  await page.goto("/tasks?view=all");
  await expect(page.getByText(title)).toBeVisible();
  await page.goto("/notifications");
  await expect(page.getByText("Liam Carter assigned you a task").first()).toBeVisible();
});
