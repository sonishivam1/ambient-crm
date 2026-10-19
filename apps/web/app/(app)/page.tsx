import {
  Bell,
  CalendarDays,
  Clock,
  FileChartColumn,
  Heart,
  NotebookText,
  SquareCheck,
  Sparkles,
  Sun,
  Target,
  TrendingUp,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import type { Notification } from "@ambient/db";

import { QuickAddTile } from "@/components/dashboard/quick-add";
import { TaskCheck } from "@/components/dashboard/task-check";
import { WeekCalendar } from "@/components/dashboard/week-calendar";
import { Avatar, Badge, Card, Dot, Empty, HealthPill, ProgressBar, Ring } from "@/components/ui/primitives";
import { getDashboard, type DashboardData } from "@/lib/data/dashboard";

import DashboardLoading from "./loading";
import { fmtDay, fmtLongDay, fmtWeekday, greeting, money, num, signedMoney, timeAgo } from "@/lib/format";

export const metadata: Metadata = { title: "Dashboard" };

const PRIORITY_LABEL = { high: "High", normal: "Medium", low: "Low" } as const;
const NOTIFICATION_ICON: Record<Notification["type"], [LucideIcon, string]> = {
  at_risk_change: [TriangleAlert, "risk"],
  contract_renewal: [NotebookText, "warn"],
  ai_suggestion: [Sparkles, "acc"],
  task_assigned: [SquareCheck, "info"],
  email_flagged: [Bell, "warn"],
  visit_reminder: [CalendarDays, "info"],
};

export default function DashboardPage() {
  return (
    <Suspense fallback={<DashboardLoading />}>
      <Dashboard />
    </Suspense>
  );
}

async function Dashboard() {
  const d = await getDashboard();
  const first = d.user.name.split(" ")[0];
  const s = d.sales;
  const asOf = s ? `as of ${fmtDay(s.asOf, d.timeZone)}` : "no sales snapshot yet";
  const mtdPct = s && s.mtd.target > 0 ? Math.round((s.mtd.actual / s.mtd.target) * 100) : null;
  const healthyPct = d.health.groups ? Math.round((d.health.g / d.health.groups) * 100) : 0;

  return (
    <>
      <div className="g-hero mb-[22px] items-stretch">
        <div className="px-2 pt-1.5">
          <div className="eyebrow">{fmtLongDay(d.now, d.timeZone)}</div>
          <h1 className="title" style={{ fontSize: 30, margin: "8px 0 6px" }}>
            {greeting(d.now, d.timeZone)}, {first}
          </h1>
          <div className="sub" style={{ maxWidth: 340 }}>
            What are your priorities for today? Here’s what’s happening with your customers.
          </div>
          <div className="mt-3.5 flex items-center gap-2.5">
            <div className="stack">
              {d.team.names.map((n, i) => (
                <Avatar key={n} name={n} size="sm" tint={(i + 1) as 1 | 2 | 3} />
              ))}
              {d.team.total > 3 && <Avatar name={`+${d.team.total - 3}`} size="sm" />}
            </div>
            {d.scope.all && (
              <span className="text-muted" style={{ fontSize: 12.5 }}>
                Viewing org-wide ·{" "}
                <Link className="text-accent underline" href="/admin/view-as">
                  View as a rep
                </Link>
              </span>
            )}
          </div>
        </div>
        <QuickAddTile />
        <Tile href="/morning-brief" icon={Sun} title="Morning brief" sub="Overnight digest of what changed" />
        <Tile href="/assistant" icon={Sparkles} title="Ask Wren" sub="Cross-book AI assistant" />
        <Tile href="/reports" icon={FileChartColumn} title="Reports library" sub="Power BI, one click away" />
      </div>

      <div className="mb-[18px] grid grid-cols-1 gap-[18px] sm:grid-cols-2 xl:grid-cols-4">
        <Kpi icon={Target} label="MTD vs target" value={mtdPct == null ? "—" : `${mtdPct}%`}>
          {s ? (
            <>
              {money(s.mtd.actual)} ·{" "}
              <b style={{ color: s.mtd.actual >= s.mtd.target ? "var(--ok)" : "var(--risk)" }}>{signedMoney(s.mtd.actual - s.mtd.target)}</b> vs target ·{" "}
              {asOf}
            </>
          ) : (
            asOf
          )}
        </Kpi>
        <Kpi icon={TrendingUp} label="YTD GM %" value={s ? `${(s.gmPct * 100).toFixed(1)}%` : "—"}>
          {asOf}
        </Kpi>
        <Kpi
          icon={Heart}
          label="Customer health"
          value={
            <span className="tnum whitespace-nowrap" style={{ fontSize: 22 }}>
              {num(d.health.g)} <span className="text-muted">/</span> {num(d.health.a)} <span className="text-muted">/</span>{" "}
              <span className="text-risk">{num(d.health.r)}</span>
            </span>
          }
        >
          {num(d.health.groups)} customer groups · green / amber / red
        </Kpi>
        <Kpi icon={SquareCheck} label="Open tasks" value={d.counts.openTasks} href="/tasks">
          {d.counts.overdue ? <b className="text-risk">{d.counts.overdue} overdue</b> : "none overdue"}
        </Kpi>
      </div>

      <div className="mb-[18px] grid grid-cols-1 items-stretch gap-[18px] xl:grid-cols-3">
        <Card title="Do first" link={{ href: "/tasks", label: "View all →" }}>
          <div className="dash-strip mt-1.5 mb-2">
            <Link className="ps" href="/tasks">
              <b style={{ color: d.counts.overdue ? "var(--accent)" : undefined }}>{d.counts.overdue}</b>
              <span>tasks overdue</span>
            </Link>
            <Link className="ps" href="/accounts">
              <b>{d.health.r}</b>
              <span>groups at risk</span>
            </Link>
            <Link className="ps" href="/call-cycle">
              <b>{d.counts.visitsLeftThisWeek}</b>
              <span>visits left</span>
            </Link>
          </div>
          {d.todayTasks.slice(0, 3).map((t) => (
            <div key={t.id} className="li">
              <span className={`ic ${t.overdue ? "risk" : "info"}`}>{t.overdue ? <TriangleAlert size={17} /> : <Clock size={17} />}</span>
              <div className="min-w-0 flex-1">
                <b>{t.title}</b>
                <p>
                  {t.account} · {t.overdue ? "overdue" : `due ${fmtDay(t.dueAt, d.timeZone)}`}
                </p>
              </div>
              {t.overdue && <Badge tone="risk">Overdue</Badge>}
            </div>
          ))}
        </Card>

        <Card title="Notifications" link={{ href: "/notifications", label: "All →" }}>
          {d.notifications.length ? (
            d.notifications.map((n) => {
              const [Icon, tone] = NOTIFICATION_ICON[n.type];
              return (
                <div key={n.id} className="li">
                  <span className={`ic ${tone}`}>
                    <Icon size={17} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <b>{n.title}</b>
                    <p>{n.body}</p>
                  </div>
                  <time dateTime={n.createdAt.toISOString()}>{timeAgo(n.createdAt, d.now)}</time>
                </div>
              );
            })
          ) : (
            <Empty title="You’re all caught up" />
          )}
        </Card>

        <Card title="Call cycle · this week" link={{ href: "/call-cycle", label: "plan →" }}>
          <WeekCalendar visits={d.calendar} today={d.now} timeZone={d.timeZone} />
        </Card>
      </div>

      <div className="mb-[18px] grid grid-cols-1 items-stretch gap-[18px] xl:grid-cols-3">
        <Card title="Today’s tasks" link={<Link className="btn xs soft" href="/tasks?new=task">+ Add</Link>}>
          {d.todayTasks.length ? (
            d.todayTasks.map((t) => {
              const progress = t.status === "in_progress" ? 60 : 10;
              return (
                <div key={t.id} className="tk">
                  <TaskCheck id={t.id} title={t.title} done={false} />
                  <div className="tt">
                    <b>{t.title}</b>
                    <span>
                      {t.account} · {t.overdue ? "overdue" : fmtDay(t.dueAt, d.timeZone)}
                    </span>
                  </div>
                  <div style={{ width: 110 }}>
                    <div className="mb-1 flex justify-between" style={{ fontSize: 11.5, fontWeight: 800 }}>
                      <span>{PRIORITY_LABEL[t.priority]}</span>
                      <span>{progress}%</span>
                    </div>
                    <ProgressBar pct={progress} tone={t.overdue ? "risk" : "dark"} />
                  </div>
                </div>
              );
            })
          ) : (
            <Empty title="All caught up" />
          )}
        </Card>

        <div className="card promo">
          <div className="pi">
            <Sparkles size={22} />
          </div>
          <h3>Meet Wren, your CRM assistant</h3>
          <p>Ask cross-book questions, draft follow-ups, and get an AI account brief in seconds.</p>
          <Link className="btn dark" href="/assistant">
            Open Wren
          </Link>
        </div>

        <div className="flex flex-col gap-[18px]">
          <Card title="Portfolio health">
            <div className="mt-1.5 flex items-center gap-5">
              <Ring pct={healthyPct} size={96} stroke={11} color="var(--ok)">
                {healthyPct}%<small className="block text-muted" style={{ fontSize: 10.5, fontWeight: 700 }}>healthy</small>
              </Ring>
              <div className="flex flex-col gap-2" style={{ fontSize: 13 }}>
                <Dot color="var(--ok)">{num(d.health.g)} healthy</Dot>
                <Dot color="var(--warn)">{num(d.health.a)} watch</Dot>
                <Dot color="var(--risk)">{num(d.health.r)} at risk</Dot>
              </div>
            </div>
          </Card>
          {d.nextVisit && (
            <Card title="Next visit">
              <div className="flex items-start gap-3">
                <span className="grid size-[38px] flex-none place-items-center rounded-xl bg-accent-soft text-accent">
                  <CalendarDays size={17} />
                </span>
                <div className="min-w-0 flex-1">
                  <b style={{ fontSize: 15 }}>{d.nextVisit.account}</b>
                  <div className="text-muted" style={{ fontSize: 12.5 }}>
                    {fmtWeekday(d.nextVisit.at, d.timeZone)} · {d.nextVisit.purpose}
                  </div>
                </div>
              </div>
              <div className="mt-3.5 flex gap-2.5">
                <Link className="btn sm" href={`/call-cycle?visit=${d.nextVisit.id}`}>
                  Reschedule
                </Link>
                <Link className="btn sm primary" href={`/call-cycle?visit=${d.nextVisit.id}&complete=1`}>
                  Complete
                </Link>
              </div>
            </Card>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 items-stretch gap-[18px] xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Card title="Sales · against target">
          {s ? <SalesPanel sales={s} top={d.topAccounts} /> : <Empty title="No sales snapshot yet">The nightly sync has not run.</Empty>}
        </Card>
        <Card title="At risk" link={{ href: "/accounts", label: "all accounts →" }}>
          {d.atRisk.length ? (
            d.atRisk.map((a) => (
              <Link key={a.id} href={`/accounts/${encodeURIComponent(a.id)}`} className="li">
                <span className="ic risk">
                  <TriangleAlert size={17} />
                </span>
                <div className="min-w-0 flex-1">
                  <b>{a.name}</b>
                  <p>
                    {a.owner} · FY {money(a.fyRevenue)}
                  </p>
                </div>
                <HealthPill band="r" />
              </Link>
            ))
          ) : (
            <Empty title="No accounts at risk" />
          )}
        </Card>
      </div>
    </>
  );
}

function Tile({ href, icon: Icon, title, sub }: { href: string; icon: LucideIcon; title: string; sub: string }) {
  return (
    <Link href={href} className="tile">
      <div className="ti">
        <Icon size={20} />
      </div>
      <b>{title}</b>
      <span>{sub}</span>
    </Link>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
  href,
  children,
}: {
  icon: LucideIcon;
  label: string;
  value: React.ReactNode;
  href?: string;
  children: React.ReactNode;
}) {
  const body = (
    <>
      <div className="ic">
        <Icon size={18} />
      </div>
      <div className="lb">{label}</div>
      <div className="v">{value}</div>
      <div className="cap">{children}</div>
    </>
  );
  return href ? (
    <Link href={href} className="card kpi">
      {body}
    </Link>
  ) : (
    <div className="card kpi">{body}</div>
  );
}

function SalesPanel({ sales, top }: { sales: NonNullable<DashboardData["sales"]>; top: DashboardData["topAccounts"] }) {
  const max = Math.max(...top.map((a) => a.fyRevenue), 1);
  return (
    <>
      <div className="mt-1.5 grid grid-cols-1 gap-[34px] md:grid-cols-2">
        <SalesBar period="MTD" actual={sales.mtd.actual} target={sales.mtd.target} daysLeft={sales.daysLeftInMonth} />
        <SalesBar period="YTD" actual={sales.ytd.actual} target={sales.ytd.target} daysLeft={sales.daysLeftInYear} />
      </div>
      <div className="lb mt-[26px] mb-2">Top accounts · FY</div>
      <div className="grid grid-cols-1 gap-x-[34px] gap-y-2 md:grid-cols-2">
        {top.map((a) => (
          <div key={a.id}>
            <div className="mb-1 flex justify-between gap-3" style={{ fontSize: 13 }}>
              <Link className="lnk truncate" href={`/accounts/${encodeURIComponent(a.id)}`}>
                {a.name}
              </Link>
              <b className="tnum">{money(a.fyRevenue)}</b>
            </div>
            <ProgressBar pct={(a.fyRevenue / max) * 100} tone="dark" />
          </div>
        ))}
      </div>
    </>
  );
}

function SalesBar({ period, actual, target, daysLeft }: { period: string; actual: number; target: number; daysLeft: number }) {
  const hasTarget = target > 0;
  const max = Math.max(actual, target, 1);
  const tx = (target / max) * 100;
  const ax = (actual / max) * 100;
  const over = hasTarget && actual > target;
  return (
    <div>
      <div className="flex justify-between">
        <div>
          <div className="lb">Sales {period}</div>
          <div style={{ fontSize: 32, fontWeight: 800, letterSpacing: "-.02em" }}>{money(actual)}</div>
        </div>
        <div className="text-right">
          <div className="lb">Target</div>
          <div className="font-bold text-muted">{hasTarget ? `${money(target)} · ${Math.round((actual / target) * 100)}%` : "—"}</div>
        </div>
      </div>
      <div className="sb-track">
        <div className="sb-fill" style={{ width: `${hasTarget ? Math.min(ax, tx) : ax}%` }} />
        {over && <div className="sb-over" style={{ left: `${tx}%`, width: `${ax - tx}%` }} />}
        {hasTarget && <div className="sb-tgt" style={{ left: `calc(${tx}% - 1px)` }} />}
      </div>
      <div className="text-muted" style={{ fontSize: 12.5 }}>
        {daysLeft} days remaining
      </div>
    </div>
  );
}
