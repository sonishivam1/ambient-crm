"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

import { SearchBox } from "@/components/accounts/search-box";
import { cn } from "@/lib/cn";

const STATUS = [
  ["active", "Active"],
  ["inactive", "Inactive"],
  ["all", "All"],
] as const;

/** Writes every filter to the URL, so the server renders the result and views can be shared. */
export function ContactsFilterBar({
  accounts,
  roles,
  query,
}: {
  accounts: { id: string; name: string }[];
  roles: { key: string; label: string }[];
  query: { q: string; role: string; account: string; status: string };
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [, startTransition] = useTransition();

  const update = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    next.delete("page");
    next.delete("new");
    const qs = next.toString();
    startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  };
  const filtered = query.q || query.role || query.account || query.status !== "active";

  return (
    <div className="fbar">
      <SearchBox key={query.q ? "q" : "empty"} initial={query.q} placeholder="Search name, email, title or account" />
      <select
        className="sel pill sm"
        style={{ width: "auto", maxWidth: 240 }}
        value={query.account}
        onChange={(e) => update({ account: e.target.value })}
        aria-label="Account"
      >
        <option value="">All accounts</option>
        {accounts.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
      </select>
      {roles.length > 0 && (
        <>
          <span className="vs" />
          <button className={cn("chip", !query.role && "on")} onClick={() => update({ role: "" })}>
            All roles
          </button>
          {roles.map((r) => (
            <button key={r.key} className={cn("chip", query.role === r.key && "on")} aria-pressed={query.role === r.key} onClick={() => update({ role: r.key })}>
              {r.label}
            </button>
          ))}
        </>
      )}
      <span className="vs" />
      <div className="seg flat" role="radiogroup" aria-label="Status">
        {STATUS.map(([key, label]) => (
          <button key={key} role="radio" aria-checked={query.status === key} className={cn(query.status === key && "on")} onClick={() => update({ status: key === "active" ? "" : key })}>
            {label}
          </button>
        ))}
      </div>
      {filtered && (
        <span className="end">
          <button className="btn ghost sm" onClick={() => update({ q: "", role: "", account: "", status: "" })}>
            Reset
          </button>
        </span>
      )}
    </div>
  );
}
