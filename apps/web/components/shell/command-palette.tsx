"use client";

import { Command } from "cmdk";
import { Building, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { Dialog } from "radix-ui";
import { useEffect, useState } from "react";

import { paletteSearch, type PaletteResult } from "@/app/actions/search";

import { useShell } from "./shell-context";

export function CommandPalette() {
  const { paletteOpen, setPaletteOpen } = useShell();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<PaletteResult[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (q.trim().length < 2) return;
    let stale = false;
    const t = setTimeout(async () => {
      setLoading(true);
      const found = await paletteSearch(q);
      if (!stale) {
        setResults(found);
        setLoading(false);
      }
    }, 150);
    return () => {
      stale = true;
      clearTimeout(t);
    };
  }, [q]);

  const go = (href: string) => {
    setPaletteOpen(false);
    setQ("");
    router.push(href);
  };
  const shown = q.trim().length < 2 ? [] : results;

  return (
    <Dialog.Root open={paletteOpen} onOpenChange={setPaletteOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="ov" />
        <Dialog.Content className="modal" aria-describedby={undefined}>
          <Dialog.Title className="sr-only">Search</Dialog.Title>
          <Command shouldFilter={false} label="Search accounts">
            <div className="flex items-center gap-2.5 border-b border-line px-5 py-4">
              <Search size={18} className="text-muted" />
              <Command.Input
                value={q}
                onValueChange={setQ}
                placeholder="Search accounts by name or code…"
                className="h-9 flex-1 bg-transparent text-[15px] outline-none"
                autoFocus
              />
              <span className="kbd">Esc</span>
            </div>
            <Command.List className="max-h-[52vh] overflow-auto p-2">
              {q.trim().length < 2 && <div className="empty">Type to jump to an account.</div>}
              {q.trim().length >= 2 && !loading && shown.length === 0 && <Command.Empty className="empty">No accounts match.</Command.Empty>}
              {shown.length > 0 && (
                <Command.Group heading={<div className="mh">Accounts</div>}>
                  {shown.map((r) => (
                    <Command.Item key={r.id} value={r.id} onSelect={() => go(r.href)} className="mi" style={{ padding: "10px 14px" }}>
                      <span className="grid size-9 flex-none place-items-center rounded-xl bg-surface2 text-text2">
                        <Building size={16} />
                      </span>
                      <span className="min-w-0">
                        <b className="block truncate">{r.title}</b>
                        <span className="text-muted" style={{ fontSize: 12 }}>
                          {r.subtitle}
                        </span>
                      </span>
                    </Command.Item>
                  ))}
                </Command.Group>
              )}
            </Command.List>
          </Command>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
