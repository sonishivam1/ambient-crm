"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

/** Narrows the call cycle to one rep; writes `?rep=` so the server renders it. */
export function RepFilter({ reps, value }: { reps: { id: string; name: string }[]; value: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [, startTransition] = useTransition();

  return (
    <select
      className="sel pill sm"
      style={{ width: "auto", maxWidth: 240 }}
      value={value}
      aria-label="Rep"
      onChange={(e) => {
        const next = new URLSearchParams(params);
        if (e.target.value) next.set("rep", e.target.value);
        else next.delete("rep");
        next.delete("new");
        const qs = next.toString();
        startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
      }}
    >
      <option value="">All reps</option>
      {reps.map((r) => (
        <option key={r.id} value={r.id}>
          {r.name}
        </option>
      ))}
    </select>
  );
}
