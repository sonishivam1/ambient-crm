import { describe, expect, it } from "vitest";

import { accountsHref, sortHref } from "./accounts-url";
import { accountsQuerySchema } from "./data/accounts";

const parse = (params: Record<string, string>) => accountsQuerySchema.parse(params);

describe("accounts query", () => {
  it("falls back to defaults for anything invalid instead of failing", () => {
    expect(parse({ view: "nope", health: "purple", page: "-3", sort: "x" })).toEqual({
      view: "group",
      div: "all",
      health: "all",
      q: "",
      sort: "fy",
      dir: "desc",
      page: 1,
    });
  });
});

describe("accountsHref", () => {
  const base = parse({});

  it("leaves defaults out of the URL", () => {
    expect(accountsHref(base, {})).toBe("/accounts");
    expect(accountsHref(base, { health: "r" })).toBe("/accounts?health=r");
  });

  it("resets to page 1 when a filter changes, but not when paging", () => {
    const onPage3 = parse({ page: "3", health: "a" });
    expect(accountsHref(onPage3, { health: "r" })).toBe("/accounts?health=r");
    expect(accountsHref(onPage3, { page: 4 })).toBe("/accounts?health=a&page=4");
  });

  it("flips direction on the active column and picks a natural direction on a new one", () => {
    expect(sortHref(base, "fy")).toBe("/accounts?dir=asc");
    expect(sortHref(base, "name")).toBe("/accounts?sort=name&dir=asc");
    expect(sortHref(parse({ sort: "name", dir: "asc" }), "tasks")).toBe("/accounts?sort=tasks");
  });
});
