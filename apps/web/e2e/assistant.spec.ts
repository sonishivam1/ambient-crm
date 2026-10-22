/** The assistant with no OpenAI key: every AI screen opens and says AI isn't set up, and nothing can be sent. */
import { expect, test } from "./support/test";

for (const user of ["rep", "harborRep"] as const) {
  test(`the chat page says AI isn't set up (${user})`, async ({ page, signInAs }) => {
    await signInAs(user);
    await page.goto("/assistant");
    const wren = page.getByRole("region", { name: "Wren" });
    await expect(wren.getByText("AI isn't set up yet.")).toBeVisible();
    await expect(wren.getByRole("textbox", { name: "Your question" })).toBeDisabled();
    await expect(wren.getByRole("button", { name: "Ask" })).toBeDisabled();
    for (const chip of await wren.getByRole("group", { name: "Suggested questions" }).getByRole("button").all()) {
      await expect(chip).toBeDisabled();
    }
  });
}

test("the side panel opens from any page and closes", async ({ page, signInAs }) => {
  await signInAs("rep");
  await page.goto("/tasks");
  await page.getByRole("button", { name: "Ask Wren" }).click();
  const panel = page.getByRole("dialog", { name: "Wren" });
  await expect(panel.getByText("AI isn't set up yet.")).toBeVisible();
  await panel.getByRole("button", { name: "Close Wren" }).click();
  await expect(panel).toBeHidden();
});

test("the account summary and morning brief say AI isn't set up", async ({ page, signInAs }) => {
  await signInAs("rep");
  await page.goto("/accounts/northwind%3ACO-ACME-BT1");
  await expect(page.getByRole("heading", { name: "Wren summary" })).toBeVisible();
  await expect(page.getByText("AI isn't set up yet.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Generate" })).toBeDisabled();

  await page.goto("/morning-brief");
  await expect(page.getByText("AI isn't set up yet.")).toBeVisible();
});
