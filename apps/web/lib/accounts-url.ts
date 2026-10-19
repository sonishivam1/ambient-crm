import type { AccountsQuery } from "@/lib/data/accounts";

const DEFAULTS: AccountsQuery = { view: "group", div: "all", health: "all", q: "", sort: "fy", dir: "desc", page: 1 };

/**
 * The /accounts URL for a query with some fields changed. Filters reset to
 * page 1; defaults are left out so URLs stay short and shareable.
 */
export function accountsHref(query: AccountsQuery, patch: Partial<AccountsQuery>): string {
  const next = { ...query, ...patch };
  if (!("page" in patch)) next.page = 1;
  const params = new URLSearchParams();
  for (const key of Object.keys(DEFAULTS) as (keyof AccountsQuery)[]) {
    if (next[key] !== DEFAULTS[key]) params.set(key, String(next[key]));
  }
  const qs = params.toString();
  return qs ? `/accounts?${qs}` : "/accounts";
}

/** Clicking the active column flips direction; a new column starts at its natural direction. */
export function sortHref(query: AccountsQuery, sort: AccountsQuery["sort"]): string {
  if (query.sort === sort) return accountsHref(query, { dir: query.dir === "asc" ? "desc" : "asc" });
  return accountsHref(query, { sort, dir: sort === "name" ? "asc" : "desc" });
}
