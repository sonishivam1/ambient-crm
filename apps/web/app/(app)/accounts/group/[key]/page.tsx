import { ChevronLeft, NotebookText, Phone, Users, type LucideIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import type { Interaction } from "@ambient/db";

import { BillToTable } from "@/components/accounts/bill-to-table";
import { Card, Dot, Empty, HealthPill, Skeleton } from "@/components/ui/primitives";
import { getGroupProfile } from "@/lib/data/group-profile";
import { fmtDate, fmtDay, initials, money, num, relativeDay } from "@/lib/format";

export const metadata: Metadata = { title: "Customer group" };

const ACTIVITY_ICON: Record<Interaction["type"], LucideIcon> = { note: NotebookText, call: Phone, meeting: Users };
const ACTIVITY_LABEL: Record<Interaction["type"], string> = { note: "Note", call: "Call", meeting: "Meeting" };

export default function GroupPage(props: PageProps<"/accounts/group/[key]">) {
  return (
    <Suspense fallback={<GroupSkeleton />}>
      <GroupContent {...props} />
    </Suspense>
  );
}

function GroupSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading customer group">
      <Skeleton className="mt-2 mb-4 h-4 w-24" />
      <Skeleton className="mb-6 h-[98px] rounded-[22px]" />
      <div className="mb-[18px] grid grid-cols-2 gap-[18px] xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-[120px] rounded-[22px]" />
        ))}
      </div>
      <Skeleton className="h-[420px] rounded-[22px]" />
    </div>
  );
}

async function GroupContent({ params }: PageProps<"/accounts/group/[key]">) {
  const { key } = await params;
  const profile = await getGroupProfile(decodeURIComponent(key));
  if (!profile) notFound();
  const { group: g, counts, health } = profile;
  const accountsTotal = counts.billTos + counts.soldTos;

  return (
    <>
      <Link className="back-link" href="/accounts">
        <ChevronLeft size={14} />
        Accounts
      </Link>

      <div className="hero-band">
        <div className="co-ic">{initials(g.name)}</div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1>{g.name}</h1>
            <HealthPill band={g.health} />
          </div>
          <div className="mt-1 text-muted">
            <span className="capitalize">{g.level}</span> · {g.divisionLabel} · {g.hierarchy.cg3} · owned by {g.owner}
            {profile.showOwner && g.ownerCode && <span className="mono"> ({g.ownerCode})</span>}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-7">
          <div className="stat">
            <div className="lb">FY revenue</div>
            <div className="vv">{money(g.fyRevenue)}</div>
          </div>
          <div className="stat">
            <div className="lb">Bill-tos</div>
            <div className="vv">{num(counts.billTos)}</div>
          </div>
          <div className="stat">
            <div className="lb">Sold-tos</div>
            <div className="vv">{num(counts.soldTos)}</div>
          </div>
        </div>
      </div>

      <div className="mb-[18px] grid grid-cols-1 gap-[18px] sm:grid-cols-2 xl:grid-cols-4">
        <div className="card kpi">
          <div className="lb">
            <Dot color="var(--ok)">Healthy</Dot>
          </div>
          <div className="v">{num(health.g)}</div>
          <div className="cap">of {num(accountsTotal)} accounts</div>
        </div>
        <div className="card kpi">
          <div className="lb">
            <Dot color="var(--warn)">Watch</Dot>
          </div>
          <div className="v">{num(health.a)}</div>
          <div className="cap">of {num(accountsTotal)} accounts</div>
        </div>
        <div className="card kpi">
          <div className="lb">
            <Dot color="var(--risk)">At risk</Dot>
          </div>
          <div className="v">{num(health.r)}</div>
          <div className="cap">of {num(accountsTotal)} accounts</div>
        </div>
        <Link href="/tasks?view=all" className="card kpi">
          <div className="lb">Open tasks</div>
          <div className="v">{num(counts.openTasks)}</div>
          <div className="cap">{counts.overdueTasks ? <b className="text-risk">{counts.overdueTasks} overdue</b> : "none overdue"}</div>
        </Link>
      </div>

      <div className="grid items-start gap-[18px] xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="card">
          <div className="card-h">
            <h3>Accounts</h3>
            <span className="text-[12.5px] text-muted">
              {num(counts.billTos)} bill-to · {num(counts.soldTos)} sold-to
            </span>
          </div>
          <BillToTable rows={profile.billTos} showOwner={profile.showOwner} />
          {(g.reported.billTos > counts.billTos || g.reported.soldTos > counts.soldTos) && (
            <div className="px-[22px] py-3.5 text-[12.5px] text-muted">
              The customer&apos;s systems list {num(g.reported.billTos)} bill-to and {num(g.reported.soldTos)} sold-to accounts; Ambient shows the ones
              synced so far ({fmtDay(g.syncedAt, profile.timeZone)}).
            </div>
          )}
        </div>

        <div className="flex flex-col gap-[18px]">
          <Card title="Recent activity">
            {profile.activity.length ? (
              profile.activity.map((a) => {
                const Icon = ACTIVITY_ICON[a.type];
                return (
                  <div key={a.id} className="li">
                    <span className="ic">
                      <Icon size={16} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <b className="block">{a.summary}</b>
                      <p>
                        {ACTIVITY_LABEL[a.type]} · {a.by} ·{" "}
                        <Link className="hover:text-accent" href={`/accounts/${encodeURIComponent(a.accountId)}`}>
                          {a.account}
                        </Link>
                      </p>
                    </div>
                    <time className="text-[12px] whitespace-nowrap text-muted" dateTime={a.at.toISOString()} title={fmtDate(a.at, profile.timeZone)}>
                      {relativeDay(a.at, profile.now, profile.timeZone)}
                    </time>
                  </div>
                );
              })
            ) : (
              <Empty title="No activity logged yet" />
            )}
          </Card>

          <Card title="Group details">
            <div className="kv">
              <span>Code</span>
              <b className="mono">{g.code}</b>
            </div>
            <div className="kv">
              <span>Segment</span>
              <b>{g.hierarchy.cg3}</b>
            </div>
            <div className="kv">
              <span>Region</span>
              <b>{g.hierarchy.cg2}</b>
            </div>
            <div className="kv">
              <span>Parent</span>
              <b>{g.hierarchy.cg1}</b>
            </div>
            <div className="kv">
              <span>Synced</span>
              <b>{fmtDay(g.syncedAt, profile.timeZone)}</b>
            </div>
          </Card>

          <div className="callout info">
            <b>Month and year to date</b> for the group (revenue against budget, gross margin, open orders) arrive with the warehouse sync.
          </div>
        </div>
      </div>
    </>
  );
}
