/**
 * The e2e `test`: signs in as a seeded user (the development sign-in cookie)
 * and fails any test whose page logs a console error or throws.
 */
import { test as base, expect, type Page } from "@playwright/test";

/** Seeded users (packages/db/src/fixtures.ts), by role. */
export const USERS = {
  rep: { id: "northwind:u-rep", name: "Priya Nair" },
  manager: { id: "northwind:u-manager", name: "Liam Carter" },
  senior: { id: "northwind:u-senior", name: "Grace Whitfield" },
  lead: { id: "northwind:u-lead", name: "Noah Bennett" },
  admin: { id: "northwind:u-admin", name: "Sam Patel" },
  super: { id: "northwind:u-super", name: "Alex Morgan" },
  // The second tenant: AI is off for it.
  harborRep: { id: "harbor:u-rep", name: "Zara Ahmed" },
  harborManager: { id: "harbor:u-manager", name: "Owen Price" },
} as const;
export type UserKey = keyof typeof USERS;

type Fixtures = {
  /** Sign in as a seeded user for the rest of the test. */
  signInAs: (user: UserKey) => Promise<void>;
  /** Console errors a test expects (e.g. a 404 page's failed load); anything else fails it. */
  allowedConsoleErrors: RegExp[];
};

export const test = base.extend<Fixtures>({
  allowedConsoleErrors: [[], { option: true }],
  signInAs: async ({ context, baseURL }, use) => {
    await use(async (user) => {
      await context.addCookies([{ name: "amb_dev_user", value: USERS[user].id, url: baseURL! }]);
    });
  },
  page: async ({ page, allowedConsoleErrors }, use) => {
    const errors: string[] = [];
    const allowed = (text: string) => allowedConsoleErrors.some((re) => re.test(text));
    page.on("console", (m) => {
      if (m.type() === "error" && !allowed(m.text())) errors.push(m.text());
    });
    page.on("pageerror", (e) => errors.push(`Uncaught: ${e.message}`));
    await use(page);
    expect(errors, "the page logged errors").toEqual([]);
  },
});

export { expect };

/** The page has no sideways scrolling. */
export async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, "the page scrolls sideways").toBeLessThanOrEqual(1);
}
