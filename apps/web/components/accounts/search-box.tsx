"use client";

import { Search } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

/** Debounced search that writes `?q=` and resets to page 1. */
export function SearchBox({ initial, placeholder }: { initial: string; placeholder: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [value, setValue] = useState(initial);
  const [, startTransition] = useTransition();
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const t = setTimeout(() => {
      const next = new URLSearchParams(params);
      if (value.trim()) next.set("q", value.trim());
      else next.delete("q");
      next.delete("page");
      const qs = next.toString();
      startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
    }, 250);
    return () => clearTimeout(t);
    // Only react to typing; params and router are read at fire time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <label className="search-inp">
      <Search size={16} />
      <input
        className="inp sm"
        type="search"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
      />
    </label>
  );
}
