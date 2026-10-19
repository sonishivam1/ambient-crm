"use client";

import { Check, ChevronDown, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { DropdownMenu } from "radix-ui";
import { useTransition } from "react";

import { cn } from "@/lib/cn";

type Option = { value: string; label: string };

const STATUS: Option[] = [
  { value: "open", label: "Open" },
  { value: "in_progress", label: "In progress" },
  { value: "overdue", label: "Overdue" },
  { value: "completed", label: "Completed" },
];
const PRIORITY: Option[] = [
  { value: "high", label: "High" },
  { value: "normal", label: "Medium" },
  { value: "low", label: "Low" },
];
const SOURCE: Option[] = [
  { value: "manual", label: "Manual" },
  { value: "ai", label: "Wren" },
  { value: "manager_assigned", label: "Manager assigned" },
];
const FILTER_KEYS = ["status", "priority", "source", "div", "account", "assignee", "from", "to"];

/** Writes every filter to the URL, so the server renders the result and views can be shared. */
export function TasksFilterBar({
  accounts,
  assignees,
  divisions,
  showDivision,
  showAssignee,
}: {
  accounts: { id: string; name: string }[];
  assignees: { id: string; name: string }[];
  divisions: { value: string; label: string }[];
  showDivision: boolean;
  showAssignee: boolean;
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
    next.set("view", "all");
    startTransition(() => router.replace(`${pathname}?${next.toString()}`, { scroll: false }));
  };

  const list = (key: string) => (params.get(key) ?? "").split(",").filter(Boolean);
  const toggle = (key: string, value: string) => {
    const current = list(key);
    update({ [key]: (current.includes(value) ? current.filter((v) => v !== value) : [...current, value]).join(",") });
  };
  const anyFilter = FILTER_KEYS.some((k) => params.get(k));

  const multi = (key: string, label: string, options: Option[]) => {
    const selected = list(key);
    return (
      <DropdownMenu.Root>
        <DropdownMenu.Trigger className={cn("chip", selected.length && "on")}>
          {label}
          {selected.length ? ` · ${selected.length}` : ""}
          <ChevronDown size={13} />
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content className="pop" align="start" sideOffset={6}>
            {options.map((o) => (
              <DropdownMenu.CheckboxItem
                key={o.value}
                className="mi"
                checked={selected.includes(o.value)}
                onSelect={(e) => e.preventDefault()}
                onCheckedChange={() => toggle(key, o.value)}
              >
                <span className={cn("check", selected.includes(o.value) && "on")} style={{ width: 20, height: 20 }}>
                  <Check size={12} strokeWidth={3} />
                </span>
                {o.label}
              </DropdownMenu.CheckboxItem>
            ))}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    );
  };

  return (
    <div className="fbar">
      {multi("status", "Status", STATUS)}
      {multi("priority", "Priority", PRIORITY)}
      {multi("source", "Source", SOURCE)}
      {showDivision && (
        <select className="sel pill sm" style={{ width: "auto" }} value={params.get("div") ?? ""} onChange={(e) => update({ div: e.target.value })} aria-label="Division">
          <option value="">Division</option>
          {divisions.map((d) => (
            <option key={d.value} value={d.value}>
              {d.label}
            </option>
          ))}
        </select>
      )}
      <select
        className="sel pill sm"
        style={{ width: "auto", maxWidth: 240 }}
        value={params.get("account") ?? ""}
        onChange={(e) => update({ account: e.target.value })}
        aria-label="Customer account"
      >
        <option value="">Customer account</option>
        {accounts.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
      </select>
      {showAssignee && (
        <select className="sel pill sm" style={{ width: "auto" }} value={params.get("assignee") ?? ""} onChange={(e) => update({ assignee: e.target.value })} aria-label="Assigned to">
          <option value="">Assigned to</option>
          {assignees.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      )}
      <span className="vs" />
      <span className="lb">Due</span>
      <input className="inp sm pill" style={{ width: 150 }} type="date" value={params.get("from") ?? ""} onChange={(e) => update({ from: e.target.value })} aria-label="Due from" />
      <span className="text-muted">→</span>
      <input className="inp sm pill" style={{ width: 150 }} type="date" value={params.get("to") ?? ""} onChange={(e) => update({ to: e.target.value })} aria-label="Due to" />
      {anyFilter && (
        <button className="chip" onClick={() => update(Object.fromEntries(FILTER_KEYS.map((k) => [k, ""])))}>
          <X size={13} />
          Clear all
        </button>
      )}
    </div>
  );
}
