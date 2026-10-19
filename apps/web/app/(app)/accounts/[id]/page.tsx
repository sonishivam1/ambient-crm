import { Building, CalendarDays, ChevronLeft, MapPin, NotebookText, Phone, Sparkles, SquareCheck, Users, type LucideIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import type { Division, HealthBand, Task } from "@ambient/db";

import { LogInteractionButton } from "@/components/accounts/log-interaction";
import { TaskCheck } from "@/components/dashboard/task-check";
import { Badge, Card, Empty, HealthPill, Skeleton, type Tone } from "@/components/ui/primitives";
import { cn } from "@/lib/cn";
import { getAccountProfile, type AccountProfile, type TimelineItem } from "@/lib/data/account-profile";
import { fmtDate, fmtDay, initials, money, relativeDay } from "@/lib/format";

export const metadata: Metadata = { title: "Customer profile" };

const TABS = [
  ["overview", "Overview"],
  ["tasks", "Tasks"],
  ["sales", "Sales"],
  ["health", "Health"],
  ["orders", "Open orders"],
  ["stock", "Stock"],
] as const;
type Tab = (typeof TABS)[number][0];

const TIMELINE_FILTERS = [
  ["all", "All"],
  ["note", "Notes"],
  ["call", "Calls"],
  ["meeting", "Meetings"],
  ["visit", "Visits"],
  ["task", "Tasks"],
] as const;
type TimelineFilter = (typeof TIMELINE_FILTERS)[number][0];

const DIVISION_LABEL: Record<Division, string> = { wholesale: "Wholesale", uniforms: "Uniforms", icw: "ICW", other: "Other" };
const PRIORITY: Record<Task["priority"], [string, Tone]> = { high: ["High", "risk"], normal: ["Medium", "warn"], low: ["Low", "out"] };
const SOURCE: Record<Task["source"], [string, Tone]> = { manual: ["Manual", "out"], ai: ["Wren", "accent"], manager_assigned: ["Manager assigned", "info"] };
const STATUS: Record<Task["status"], string> = { open: "Open", in_progress: "In progress", completed: "Completed", cancelled: "Cancelled" };

const pick = <T extends string>(value: string | string[] | undefined, allowed: readonly (readonly [T, string])[], fallback: T): T => {
  const v = Array.isArray(value) ? value[0] : value;
  return allowed.some(([k]) => k === v) ? (v as T) : fallback;
};

export default function AccountProfilePage(props: PageProps<"/accounts/[id]">) {
  return (
    <Suspense fallback={<ProfileSkeleton />}>
      <ProfileContent {...props} />
    </Suspense>
  );
}

function ProfileSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading account">
      <Skeleton className="mt-2 mb-4 h-4 w-24" />
      <Skeleton className="mb-6 h-[98px] rounded-[22px]" />
      <Skeleton className="mb-5 h-11 w-[520px] max-w-full" />
      <div className="grid gap-[18px] xl:grid-cols-[minmax(0,1fr)_340px]">
        <Skeleton className="h-[480px] rounded-[22px]" />
        <Skeleton className="h-[480px] rounded-[22px]" />
      </div>
    </div>
  );
}

async function ProfileContent({ params, searchParams }: PageProps<"/accounts/[id]">) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const profile = await getAccountProfile(decodeURIComponent(id));
  if (!profile) notFound();

  const tab = pick<Tab>(query.tab, TABS, "overview");
  const filter = pick<TimelineFilter>(query.tl, TIMELINE_FILTERS, "all");
  const base = `/accounts/${encodeURIComponent(profile.account.id)}`;
  const { account: a } = profile;

  return (
    <>
      <Link className="back-link" href="/accounts">
        <ChevronLeft size={14} />
        Accounts
      </Link>

      <div className="hero-band">
        <div className="co-ic">{initials(a.name)}</div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1>{a.name}</h1>
            <HealthPill band={a.health} />
          </div>
          <div className="mt-1 text-muted">
            {a.type === "bill_to" ? "Bill-To" : "Sold-To"} · {a.segment} · {DIVISION_LABEL[a.division]} · owned by {a.owner}
            {profile.group && (
              <>
                {" · "}
                <Link className="font-bold text-accent" href={`/accounts/group/${encodeURIComponent(profile.group.id)}`}>
                  {profile.group.name}
                </Link>
              </>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-7">
          <Stat label="FY revenue" value={money(a.fyRevenue)} />
          <Stat
            label="Open tasks"
            value={
              <>
                {profile.counts.openTasks}
                {profile.counts.overdue > 0 && <span className="ml-1.5 text-[13px] text-risk">{profile.counts.overdue} overdue</span>}
              </>
            }
          />
          <Stat label="Next visit" value={profile.nextVisit ? relativeDay(profile.nextVisit.at, profile.now) : "—"} />
          <Stat label="Last touch" value={profile.lastTouch ? relativeDay(profile.lastTouch, profile.now) : "—"} />
          <LogInteractionButton accountId={a.id} accountName={a.name} />
        </div>
      </div>

      <nav className="tabs" aria-label="Account sections">
        {TABS.map(([key, label]) => (
          <Link key={key} href={key === "overview" ? base : `${base}?tab=${key}`} className={cn(tab === key && "on")} aria-current={tab === key ? "page" : undefined} scroll={false}>
            {label}
            {key === "tasks" && profile.counts.openTasks > 0 ? ` · ${profile.counts.openTasks}` : ""}
          </Link>
        ))}
      </nav>

      {tab === "overview" && <Overview profile={profile} filter={filter} base={base} />}
      {tab === "tasks" && <Tasks profile={profile} />}
      {tab === "sales" && <Sales profile={profile} />}
      {tab === "health" && <Health profile={profile} />}
      {tab === "orders" && <ComingWithSync what="Open orders" detail="open styles with and without inbound stock, units and value, broken down by product line" />}
      {tab === "stock" && <ComingWithSync what="Stock" detail="customer stock liability, stock on hand, and the active, phase-out and slow-moving split" />}
    </>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="stat">
      <div className="lb">{label}</div>
      <div className="vv">{value}</div>
    </div>
  );
}

const TIMELINE_ICON: Record<string, LucideIcon> = {
  note: NotebookText,
  call: Phone,
  meeting: Users,
  site: MapPin,
  task: SquareCheck,
};

function iconFor(item: TimelineItem): LucideIcon {
  if (item.kind === "task") return TIMELINE_ICON.task!;
  return TIMELINE_ICON[item.type] ?? NotebookText;
}

function matches(item: TimelineItem, filter: TimelineFilter): boolean {
  if (filter === "all") return true;
  if (filter === "visit") return item.kind === "visit";
  if (filter === "task") return item.kind === "task";
  return item.kind === "interaction" && item.type === filter;
}

function Overview({ profile, filter, base }: { profile: AccountProfile; filter: TimelineFilter; base: string }) {
  const items = profile.timeline.filter((t) => matches(t, filter));
  const { account: a } = profile;
  return (
    <div className="grid items-start gap-[18px] xl:grid-cols-[minmax(0,1fr)_340px]">
      <Card
        title="Timeline"
        link={
          <div className="flex flex-wrap gap-1.5">
            {TIMELINE_FILTERS.map(([key, label]) => (
              <Link key={key} className={cn("chip", filter === key && "on")} href={key === "all" ? base : `${base}?tl=${key}`} scroll={false}>
                {label}
              </Link>
            ))}
          </div>
        }
        bodyClassName="tl"
      >
        {items.length ? (
          items.map((t) => {
            const Icon = iconFor(t);
            return (
              <div key={`${t.kind}-${t.id}`} className="ti2">
                <div className="tt2">
                  <Icon size={17} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="ty">{t.title}</div>
                  <b className="font-semibold">{t.body}</b>
                  <p>{t.by}</p>
                </div>
                <time className="text-[12px] whitespace-nowrap text-muted" dateTime={t.at.toISOString()} title={fmtDate(t.at)}>
                  {relativeDay(t.at, profile.now)}
                </time>
              </div>
            );
          })
        ) : (
          <Empty title={filter === "all" ? "Nothing logged yet" : "Nothing of this type yet"}>
            Log an interaction to start the timeline. Captured email and meetings will appear here automatically.
          </Empty>
        )}
      </Card>

      <div className="flex flex-col gap-[18px]">
        <Card title={<span className="eyebrow">Wren summary</span>}>
          <p className="mt-0 mb-3.5 text-[13.5px] text-muted">
            A fresh read on this account from its correspondence and open tasks, generated on request. Arrives with the AI layer.
          </p>
          <button className="btn sm" disabled>
            <Sparkles size={15} />
            Generate
          </button>
        </Card>

        <Card title="Next touchpoint">
          {profile.nextVisit ? (
            <div className="flex items-start gap-3">
              <span className="grid size-[38px] flex-none place-items-center rounded-xl bg-accent-soft text-accent">
                <CalendarDays size={17} />
              </span>
              <div>
                <b>{fmtDate(profile.nextVisit.at)}</b>
                <div className="text-[12.5px] text-muted">
                  {profile.nextVisit.purpose} · {profile.nextVisit.rep}
                </div>
              </div>
            </div>
          ) : (
            <div className="text-[13.5px] text-muted">No visit planned.</div>
          )}
        </Card>

        <Card title="Details">
          <div className="kv">
            <span>Code</span>
            <b className="mono">{a.code}</b>
          </div>
          <div className="kv">
            <span>Site</span>
            <b>{a.site}</b>
          </div>
          <div className="kv">
            <span>Segment</span>
            <b>{a.segment}</b>
          </div>
          <div className="kv">
            <span>Owner</span>
            <b>{a.owner}</b>
          </div>
          <div className="kv">
            <span>Synced</span>
            <b>{fmtDay(a.syncedAt)}</b>
          </div>
        </Card>

        <Related profile={profile} />

        <Card title="Contacts">
          <div className="text-[13.5px] text-muted">Contacts arrive with the Contacts feature.</div>
        </Card>
        <Card title="Contracts">
          <div className="text-[13.5px] text-muted">Contracts arrive with the warehouse sync.</div>
        </Card>
      </div>
    </div>
  );
}

function Related({ profile }: { profile: AccountProfile }) {
  const isBillTo = profile.account.type === "bill_to";
  const rows = profile.related;
  return (
    <Card title={isBillTo ? `Sold-to accounts · ${rows.length}` : "Related accounts"}>
      {!isBillTo && profile.parent && (
        <RelatedRow id={profile.parent.id} name={profile.parent.name} sub={`Bill-to · ${profile.parent.code}`} health={profile.parent.health} />
      )}
      {rows.length ? (
        rows.slice(0, 8).map((r) => <RelatedRow key={r.id} id={r.id} name={r.name} sub={`${r.type === "bill_to" ? "Bill-to" : "Sold-to"} · ${r.code}`} health={r.health} />)
      ) : isBillTo ? (
        <div className="text-[13.5px] text-muted">No sold-to accounts.</div>
      ) : null}
      {rows.length > 8 && <div className="mt-2 text-[12.5px] text-muted">and {rows.length - 8} more</div>}
    </Card>
  );
}

function RelatedRow({ id, name, sub, health }: { id: string; name: string; sub: string; health: HealthBand | null }) {
  return (
    <Link href={`/accounts/${encodeURIComponent(id)}`} className="li">
      <span className="ic">
        <Building size={16} />
      </span>
      <div className="min-w-0 flex-1">
        <b className="block truncate">{name}</b>
        <p>{sub}</p>
      </div>
      <HealthPill band={health} />
    </Link>
  );
}

function Tasks({ profile }: { profile: AccountProfile }) {
  return (
    <>
      <div className="card pad mb-4 flex items-center justify-between gap-4">
        <div>
          <div className="lb" style={{ color: "var(--text2)" }}>
            Account tasks · {profile.tasks.length}
          </div>
          <div className="mt-0.5 text-[12.5px] text-muted">Open and completed tasks for this account. Creating tasks arrives with the Tasks page.</div>
        </div>
      </div>
      <div className="card">
        {profile.tasks.length ? (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Task</th>
                  <th>Assigned to</th>
                  <th>Due</th>
                  <th>Priority</th>
                  <th>Status</th>
                  <th>Source</th>
                  <th className="num">Done</th>
                </tr>
              </thead>
              <tbody>
                {profile.tasks.map((t) => {
                  const done = t.status === "completed";
                  return (
                    <tr key={t.id}>
                      <td>
                        <span className={cn("font-bold", done && "text-muted line-through")}>{t.title}</span>
                      </td>
                      <td>{t.owner}</td>
                      <td className={cn(t.overdue && "font-bold text-risk")}>{fmtDate(t.dueAt)}</td>
                      <td>
                        <Badge tone={PRIORITY[t.priority][1]}>{PRIORITY[t.priority][0]}</Badge>
                      </td>
                      <td>{t.overdue ? <Badge tone="risk">Overdue</Badge> : <Badge tone={done ? "ok" : "info"}>{STATUS[t.status]}</Badge>}</td>
                      <td>
                        <Badge tone={SOURCE[t.source][1]}>{SOURCE[t.source][0]}</Badge>
                      </td>
                      <td className="num">
                        <span className="inline-flex justify-end">
                          <TaskCheck id={t.id} title={t.title} done={done} />
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty title="No tasks for this account yet" />
        )}
      </div>
    </>
  );
}

function Sales({ profile }: { profile: AccountProfile }) {
  return (
    <>
      <div className="mb-[18px] grid gap-[18px] md:grid-cols-2">
        <div className="card kpi">
          <div className="lb">FY revenue</div>
          <div className="v">{money(profile.account.fyRevenue)}</div>
          <div className="cap">this account · as of {fmtDay(profile.account.syncedAt)}</div>
        </div>
        {profile.group && (
          <div className="card kpi">
            <div className="lb">Customer group FY revenue</div>
            <div className="v">{money(profile.group.fyRevenue)}</div>
            <div className="cap">{profile.group.name}</div>
          </div>
        )}
      </div>
      <ComingWithSync what="Month and year to date" detail="revenue against budget, value to ship, latest estimate, variance, gross margin and the monthly trend" />
    </>
  );
}

function Health({ profile }: { profile: AccountProfile }) {
  return (
    <>
      <div className="card pad mb-[18px] flex flex-wrap items-center gap-6">
        <div>
          <div className="lb mb-2">This account</div>
          <HealthPill band={profile.account.health} />
        </div>
        {profile.group && (
          <div>
            <div className="lb mb-2">Customer group</div>
            <HealthPill band={profile.group.health} />
          </div>
        )}
        <p className="m-0 max-w-[560px] text-muted">
          The band comes from the customer&apos;s systems today. Ambient&apos;s own score will blend sales against target, email sentiment, contact
          freshness and service load once capture and sync are live.
        </p>
      </div>
      <ComingWithSync what="Health signals" detail="the four signal bars and the score trend" />
    </>
  );
}

function ComingWithSync({ what, detail }: { what: string; detail: string }) {
  return (
    <div className="callout info">
      <b>{what}</b> arrive with the warehouse sync: {detail}.
    </div>
  );
}
