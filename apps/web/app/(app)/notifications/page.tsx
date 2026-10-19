import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { NOTIFICATION_META } from "@/components/notifications/meta";
import { MarkAllReadButton, MarkReadButton } from "@/components/notifications/read-controls";
import { Badge, Empty, PageHead, Skeleton } from "@/components/ui/primitives";
import { cn } from "@/lib/cn";
import { getNotifications, notificationsQuerySchema, type NotificationsQuery } from "@/lib/data/notifications";
import { num, timeAgo } from "@/lib/format";

export const metadata: Metadata = { title: "Notifications" };

type RawParams = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default function NotificationsPage({ searchParams }: PageProps<"/notifications">) {
  return (
    <Suspense fallback={<NotificationsSkeleton />}>
      <NotificationsContent searchParams={searchParams} />
    </Suspense>
  );
}

function NotificationsSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading notifications">
      <Skeleton className="mt-2.5 mb-3 h-3 w-24" />
      <Skeleton className="mb-6 h-8 w-64" />
      <Skeleton className="mb-4 h-14 rounded-[20px]" />
      <Skeleton className="mb-[18px] h-[260px] rounded-[22px]" />
      <Skeleton className="h-[200px] rounded-[22px]" />
    </div>
  );
}

function href(query: NotificationsQuery, patch: Partial<NotificationsQuery>) {
  const next = { ...query, page: 1, ...patch };
  const params = new URLSearchParams();
  if (next.show !== "all") params.set("show", next.show);
  if (next.type) params.set("type", next.type);
  if (next.page > 1) params.set("page", String(next.page));
  const qs = params.toString();
  return qs ? `/notifications?${qs}` : "/notifications";
}

async function NotificationsContent({ searchParams }: { searchParams: Promise<RawParams> }) {
  const raw = await searchParams;
  const query = notificationsQuerySchema.parse(Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, first(v)])));
  const page = await getNotifications(query);

  return (
    <>
      <PageHead
        eyebrow="Notifications"
        title="Your alerts"
        meta={`· ${num(page.unread)} unread`}
        sub="Assignments, at-risk changes, renewals and reminders: your full history in one place."
        actions={<MarkAllReadButton unread={page.unread} />}
      />

      <div className="fbar">
        <span className="lb mr-1">Show</span>
        <Link className={cn("chip", query.show === "all" && "on")} href={href(query, { show: "all" })} scroll={false}>
          All
        </Link>
        <Link className={cn("chip", query.show === "unread" && "on")} href={href(query, { show: "unread" })} scroll={false}>
          Unread · {num(page.unread)}
        </Link>
        {page.types.length > 1 && (
          <>
            <span className="vs" />
            <Link className={cn("chip", !query.type && "on")} href={href(query, { type: "" })} scroll={false}>
              Every type
            </Link>
            {page.types.map((t) => (
              <Link key={t} className={cn("chip", query.type === t && "on")} href={href(query, { type: t })} scroll={false}>
                {NOTIFICATION_META[t].label}
              </Link>
            ))}
          </>
        )}
      </div>

      {page.groups.length ? (
        page.groups.map((g) => (
          <div key={g.key} className="card mb-[18px]">
            <div className="wkh">
              <span className="eb">{g.label}</span>
              <span className="tnum ml-auto text-[13px] text-muted">{g.items.length}</span>
            </div>
            {g.items.map((n) => {
              const meta = NOTIFICATION_META[n.type];
              const Icon = meta.icon;
              return (
                <div key={n.id} className="li" style={{ padding: "16px 22px" }}>
                  <span className={`ic ${meta.tone}`}>
                    <Icon size={17} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      {!n.read && <span className="size-2 flex-none rounded-full bg-accent" role="img" aria-label="Unread" />}
                      <b className={cn("truncate", n.read && "font-semibold text-text2")}>{n.title}</b>
                    </div>
                    <p>{n.body}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-[12.5px]">
                      <Badge tone="out">{meta.label}</Badge>
                      {n.account && (
                        <Link className="lnk" href={`/accounts/${encodeURIComponent(n.account.id)}`}>
                          {n.account.name}
                        </Link>
                      )}
                    </div>
                  </div>
                  <div className="flex min-w-[92px] flex-none flex-col items-end gap-2">
                    <time dateTime={n.createdAt.toISOString()}>{timeAgo(n.createdAt, page.now)}</time>
                    {!n.read && <MarkReadButton id={n.id} />}
                  </div>
                </div>
              );
            })}
          </div>
        ))
      ) : (
        <div className="card">
          <Empty title={query.show === "unread" ? "You're all caught up" : "No notifications yet"}>
            {query.show === "unread" ? "Nothing unread. Switch to All to see your history." : "Assignments, at-risk changes and reminders will show up here."}
          </Empty>
        </div>
      )}

      {page.pages > 1 && (
        <nav className="pager" aria-label="Pagination">
          <span>
            page {query.page} of {page.pages} · {num(page.total)} notifications
          </span>
          <div className="flex gap-1.5">
            {query.page > 1 ? (
              <Link className="btn sm" href={href(query, { page: query.page - 1 })}>
                <ChevronLeft size={14} />
                Newer
              </Link>
            ) : (
              <button className="btn sm" disabled>
                <ChevronLeft size={14} />
                Newer
              </button>
            )}
            {query.page < page.pages ? (
              <Link className="btn sm" href={href(query, { page: query.page + 1 })}>
                Older
                <ChevronRight size={14} />
              </Link>
            ) : (
              <button className="btn sm" disabled>
                Older
                <ChevronRight size={14} />
              </button>
            )}
          </div>
        </nav>
      )}
    </>
  );
}
