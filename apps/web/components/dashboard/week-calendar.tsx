"use client";

import { ChevronLeft, ChevronRight, MapPin, Phone, Users } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { Badge } from "@/components/ui/primitives";
import { cn } from "@/lib/cn";
import { fmtDay, isoDay, mondayOf } from "@/lib/format";

export type CalendarVisit = {
  id: string;
  accountId: string;
  account: string;
  purpose: string;
  type: "site" | "call" | "meeting";
  status: "planned" | "completed" | "cancelled";
  at: Date;
};

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const ICON = { site: MapPin, call: Phone, meeting: Users };

export function WeekCalendar({ visits, today }: { visits: CalendarVisit[]; today: Date }) {
  const [week, setWeek] = useState(0);
  const [selected, setSelected] = useState(isoDay(today));

  const start = mondayOf(today);
  start.setDate(start.getDate() + week * 7);
  const days = Array.from({ length: 7 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
  const onDay = (key: string) => visits.filter((v) => isoDay(v.at) === key);
  const shown = onDay(selected);

  const moveWeek = (delta: number) => {
    const next = week + delta;
    setWeek(next);
    const first = mondayOf(today);
    first.setDate(first.getDate() + next * 7);
    setSelected(isoDay(first));
  };

  return (
    <>
      <div className="mt-1.5 mb-3 flex items-center justify-between">
        <button className="btn icon sm ghost" aria-label="Previous week" onClick={() => moveWeek(-1)}>
          <ChevronLeft size={14} />
        </button>
        <b>
          {fmtDay(days[0]!)} – {fmtDay(days[6]!)}
        </b>
        <button className="btn icon sm ghost" aria-label="Next week" onClick={() => moveWeek(1)}>
          <ChevronRight size={14} />
        </button>
      </div>
      <div className="cal">
        {DAY_NAMES.map((d) => (
          <div key={d} className="dw">
            {d}
          </div>
        ))}
        {days.map((d) => {
          const key = isoDay(d);
          return (
            <button
              key={key}
              className={cn("day", key === selected && "sel", onDay(key).length > 0 && "has")}
              aria-pressed={key === selected}
              onClick={() => setSelected(key)}
            >
              {d.getDate()}
            </button>
          );
        })}
      </div>
      {shown.length ? (
        shown.map((v) => {
          const Icon = ICON[v.type];
          return (
            <Link key={v.id} href={`/accounts/${encodeURIComponent(v.accountId)}`} className="evt">
              <span className="ic">
                <Icon size={17} />
              </span>
              <div className="min-w-0 flex-1">
                <b className="block truncate">{v.account}</b>
                <div className="text-muted" style={{ fontSize: 12 }}>
                  {v.purpose}
                </div>
              </div>
              <Badge tone={v.status === "completed" ? "out" : "info"}>{v.status}</Badge>
            </Link>
          );
        })
      ) : (
        <div className="evt justify-center text-muted">No visits on {fmtDay(new Date(`${selected}T00:00:00`))}</div>
      )}
    </>
  );
}
