import { ChevronLeft, ChevronRight, LayoutGrid, List, MapPin, Phone, Users, type LucideIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { addDays } from "@ambient/db/time";

import { Badge, Empty, PageHead, Skeleton } from "@/components/ui/primitives";
import { AddVisitButton, VisitActions, VisitTile } from "@/components/visits/visit-controls";
import { RepFilter } from "@/components/visits/rep-filter";
import { cn } from "@/lib/cn";
import { callCycleQuerySchema, getCallCycle, type CallCycle, type CallCycleQuery } from "@/lib/data/visits";
import { fmtDay, fmtTime, fmtWeekday, isoDay } from "@/lib/format";
import { CALL_CYCLE_WEEKS, HISTORY_WEEKS, SENTIMENT_LABEL, VISIT_TYPE_LABEL, type VisitRow } from "@/lib/visits";

export const metadata: Metadata = { title: "Call cycle" };

type RawParams = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const ICON: Record<VisitRow["type"], LucideIcon> = { site: MapPin, call: Phone, meeting: Users };
const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default function CallCyclePage({ searchParams }: PageProps<"/call-cycle">) {
  return (
    <Suspense fallback={<CallCycleSkeleton />}>
      <CallCycleContent searchParams={searchParams} />
    </Suspense>
  );
}

function CallCycleSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading the call cycle">
      <Skeleton className="mt-2.5 mb-3 h-3 w-20" />
      <Skeleton className="mb-6 h-8 w-72" />
      <Skeleton className="mb-4 h-11 w-60 rounded-full" />
      <Skeleton className="mb-[18px] h-[200px] rounded-[22px]" />
      <Skeleton className="h-[200px] rounded-[22px]" />
    </div>
  );
}

function hrefWith(raw: RawParams, patch: Record<string, string | null>) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(raw)) {
    const value = first(v);
    if (value && k !== "new") params.set(k, value);
  }
  for (const [k, v] of Object.entries(patch)) {
    if (v === null) params.delete(k);
    else params.set(k, v);
  }
  const qs = params.toString();
  return qs ? `/call-cycle?${qs}` : "/call-cycle";
}

async function CallCycleContent({ searchParams }: { searchParams: Promise<RawParams> }) {
  const raw = await searchParams;
  const query = callCycleQuerySchema.parse(Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, first(v)])));
  const cycle = await getCallCycle(query);
  const ctx = { assignable: cycle.assignable, ownRepId: cycle.ownRepId, timeZone: cycle.timeZone };
  const team = cycle.reps.length > 0;
  const olderOverdue = cycle.overdue.filter((v) => v.at < cycle.weeks[0]!.start);

  return (
    <>
      <PageHead
        eyebrow="Call cycle"
        title="The next six weeks"
        meta={`· ${cycle.title.toLowerCase()}`}
        sub={team ? "Every booked visit across the team. Plan, complete or cancel." : "Your booked visits. Plan, complete or cancel."}
        actions={<AddVisitButton openFromUrl {...ctx} />}
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="seg" role="radiogroup" aria-label="View">
          <Link role="radio" aria-checked={query.view === "list"} className={cn(query.view === "list" && "on")} href={hrefWith(raw, { view: null, wk: null })} scroll={false}>
            <List size={15} />
            List
          </Link>
          <Link role="radio" aria-checked={query.view === "week"} className={cn(query.view === "week" && "on")} href={hrefWith(raw, { view: "week" })} scroll={false}>
            <LayoutGrid size={15} />
            Week
          </Link>
        </div>
        {team && <RepFilter reps={cycle.reps} value={cycle.rep} />}
      </div>

      {olderOverdue.length > 0 && (
        <div className="card mb-[18px]">
          <div className="wkh">
            <span className="eb" style={{ color: "var(--risk)" }}>
              Needs closing · {olderOverdue.length}
            </span>
            <span className="ml-auto text-[13px] text-muted">Planned visits from earlier weeks: complete or cancel them.</span>
          </div>
          {olderOverdue.map((v) => (
            <VisitLine key={v.id} visit={v} cycle={cycle} ctx={ctx} showRep={team} />
          ))}
        </div>
      )}

      {query.view === "week" ? <WeekGrid cycle={cycle} query={query} raw={raw} ctx={ctx} /> : <WeekList cycle={cycle} ctx={ctx} showRep={team} />}

      <details className="card mt-[22px]">
        <summary className="wkh cursor-pointer list-none">
          <span className="eb">History · last {HISTORY_WEEKS} weeks</span>
          <span className="ml-auto text-muted">
            {cycle.history.length} {cycle.history.length === 1 ? "visit" : "visits"}
          </span>
        </summary>
        {cycle.history.length ? (
          cycle.history.map((v) => <VisitLine key={v.id} visit={v} cycle={cycle} ctx={ctx} showRep={team} />)
        ) : (
          <Empty title="No visits in the last four weeks" />
        )}
      </details>
    </>
  );
}

type Ctx = { assignable: CallCycle["assignable"]; ownRepId: string | null; timeZone: string };

function weekLabel(start: Date, index: number, timeZone: string) {
  const end = addDays(start, 6, timeZone);
  return `${index === 0 ? "This week · " : ""}${fmtDay(start, timeZone)} – ${fmtDay(end, timeZone)}`;
}

function WeekList({ cycle, ctx, showRep }: { cycle: CallCycle; ctx: Ctx; showRep: boolean }) {
  return (
    <div className="flex flex-col gap-[18px]">
      {cycle.weeks.map((w, i) => (
        <div key={w.start.toISOString()} className="card">
          <div className="wkh">
            <span className="eb">{weekLabel(w.start, i, cycle.timeZone)}</span>
            <span className="tnum ml-auto text-[13px] text-muted">
              {w.visits.length} {w.visits.length === 1 ? "visit" : "visits"}
            </span>
          </div>
          {w.visits.length ? (
            w.visits.map((v) => <VisitLine key={v.id} visit={v} cycle={cycle} ctx={ctx} showRep={showRep} />)
          ) : (
            <div className="empty" style={{ padding: 20 }}>
              Nothing booked.
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function VisitLine({ visit: v, cycle, ctx, showRep }: { visit: VisitRow; cycle: CallCycle; ctx: Ctx; showRep: boolean }) {
  const Icon = ICON[v.type];
  const done = v.status === "completed";
  return (
    <div className={cn("vrow", done && "done")}>
      <span className="dy" style={{ color: v.overdue ? "var(--risk)" : done ? "var(--muted)" : "var(--text2)" }}>
        {v.overdue ? "OVERDUE" : fmtWeekday(v.at, cycle.timeZone)}
        <br />
        <span className="font-normal">{v.overdue ? fmtDay(v.at, cycle.timeZone) : fmtTime(v.at, cycle.timeZone)}</span>
      </span>
      <span className="grid size-9 flex-none place-items-center rounded-xl bg-surface2 text-text2">
        <Icon size={16} />
      </span>
      <div className="min-w-0 flex-1">
        <Link className="lnk font-bold" href={`/accounts/${encodeURIComponent(v.accountId)}`} style={done ? { color: "var(--muted)" } : undefined}>
          {v.account}
        </Link>
        <div className="text-[12.5px] text-muted">{[VISIT_TYPE_LABEL[v.type], v.purpose, showRep ? v.rep : null].filter(Boolean).join(" · ")}</div>
      </div>
      {done ? (
        <Badge tone={v.report ? "ok" : "warn"}>{v.report ? SENTIMENT_LABEL[v.report.sentiment] : "Report missing"}</Badge>
      ) : (
        <Badge tone={v.overdue ? "risk" : "info"}>{v.overdue ? "Overdue" : "Planned"}</Badge>
      )}
      <VisitActions visit={v} {...ctx} />
    </div>
  );
}

function WeekGrid({ cycle, query, raw, ctx }: { cycle: CallCycle; query: CallCycleQuery; raw: RawParams; ctx: Ctx }) {
  const week = cycle.weeks[query.wk]!;
  const days = Array.from({ length: 7 }, (_, i) => addDays(week.start, i, cycle.timeZone));
  const todayKey = isoDay(cycle.today, cycle.timeZone);
  const nav = (delta: number, label: string, Icon: LucideIcon) => {
    const next = query.wk + delta;
    return next >= 0 && next < CALL_CYCLE_WEEKS ? (
      <Link className="btn icon sm" href={hrefWith(raw, { view: "week", wk: next ? String(next) : null })} aria-label={label} scroll={false}>
        <Icon size={14} />
      </Link>
    ) : (
      <button className="btn icon sm" disabled aria-label={label}>
        <Icon size={14} />
      </button>
    );
  };

  return (
    <>
      <div className="mb-3 flex items-center gap-2.5">
        {nav(-1, "Previous week", ChevronLeft)}
        <b className="eyebrow" style={{ color: "var(--text)", margin: 0 }}>
          {weekLabel(week.start, query.wk, cycle.timeZone)}
        </b>
        {nav(1, "Next week", ChevronRight)}
        <span className="ml-auto text-muted">
          {week.visits.length} {week.visits.length === 1 ? "visit" : "visits"}
        </span>
      </div>
      <div className="wk">
        {days.map((d, i) => {
          const key = isoDay(d, cycle.timeZone);
          const onDay = week.visits.filter((v) => isoDay(v.at, cycle.timeZone) === key);
          return (
            <div key={key}>
              <div className={cn("dn", key === todayKey && "today")}>
                <span>{DAY_NAMES[i]}</span>
                <b>{fmtDay(d, cycle.timeZone).split(" ")[0]}</b>
              </div>
              {onDay.map((v) => (
                <VisitTile key={v.id} visit={v} {...ctx} />
              ))}
            </div>
          );
        })}
      </div>
    </>
  );
}
