import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { DIVISIONS, type Division } from "@ambient/db";

import { GroupTable } from "@/components/accounts/group-table";
import { SearchBox } from "@/components/accounts/search-box";
import { Badge, Dot, Empty, HealthPill, PageHead, Skeleton } from "@/components/ui/primitives";
import { accountsHref, sortHref } from "@/lib/accounts-url";
import { cn } from "@/lib/cn";
import { accountsQuerySchema, getAccountsPage, type AccountsPage, type AccountsQuery } from "@/lib/data/accounts";
import { getScope } from "@/lib/data/scope";
import { lensDivisions } from "@/lib/lens";
import { money, num } from "@/lib/format";

export const metadata: Metadata = { title: "Accounts" };

const DIVISION_LABEL: Record<Division, string> = { wholesale: "Wholesale", uniforms: "Uniforms", icw: "ICW", other: "Other" };
const HEALTH_CHIPS = [
  ["all", "All health"],
  ["g", "Healthy"],
  ["a", "Watch"],
  ["r", "At risk"],
] as const;
const VIEWS = [
  ["group", "Group"],
  ["bill_to", "Bill-to"],
  ["sold_to", "Sold-to"],
] as const;

export default function AccountsPage({ searchParams }: PageProps<"/accounts">) {
  return (
    <Suspense fallback={<AccountsSkeleton />}>
      <AccountsContent searchParams={searchParams} />
    </Suspense>
  );
}

function AccountsSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading accounts">
      <Skeleton className="mt-2.5 mb-3 h-3 w-24" />
      <Skeleton className="mb-6 h-8 w-80" />
      <Skeleton className="mb-4 h-11 w-72 rounded-full" />
      <Skeleton className="mb-4 h-14 rounded-[20px]" />
      <Skeleton className="mb-4 h-16 rounded-[20px]" />
      <Skeleton className="h-[520px] rounded-[22px]" />
    </div>
  );
}

async function AccountsContent({ searchParams }: { searchParams: PageProps<"/accounts">["searchParams"] }) {
  const raw = await searchParams;
  const query = accountsQuerySchema.parse(Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v])));
  const [page, scope] = await Promise.all([getAccountsPage(query), getScope()]);
  const divisions = lensDivisions(scope.lens) ?? [...DIVISIONS];
  const isGroup = page.kind === "group";
  const unit = isGroup ? "customer groups" : "accounts";

  return (
    <>
      <PageHead
        eyebrow="Accounts"
        title={isGroup ? (page.global ? "Every customer group" : "Your customer groups") : page.global ? "Every account" : "Your book"}
        meta={`· ${num(page.summary.total)} ${unit}`}
        sub={
          isGroup
            ? "Conglomerates, corporations and standalone customers. Expand a row to see its bill-to and sold-to accounts."
            : query.view === "bill_to"
              ? "Bill-to accounts: who pays."
              : "Sold-to accounts: where goods go."
        }
      />

      <div className="mb-3.5 flex items-center gap-2.5">
        <span className="lb">View</span>
        <nav className="seg" aria-label="Account level">
          {VIEWS.map(([v, label]) => (
            <Link
              key={v}
              href={accountsHref(query, { view: v, sort: query.sort === "tasks" && v === "group" ? "fy" : query.sort })}
              className={cn(query.view === v && "on")}
              aria-current={query.view === v ? "page" : undefined}
            >
              {label}
            </Link>
          ))}
        </nav>
      </div>

      <div className="stats-strip">
        <span>
          <b>{num(page.summary.total)}</b> {unit}
        </span>
        <span className="text-muted">·</span>
        <span>
          FY <b>{money(page.summary.fyRevenue)}</b>
        </span>
        <span className="text-muted">·</span>
        <Dot color="var(--ok)">{num(page.summary.health.g)} healthy</Dot>
        <Dot color="var(--warn)">{num(page.summary.health.a)} watch</Dot>
        <Dot color="var(--risk)">{num(page.summary.health.r)} at risk</Dot>
      </div>

      <div className="fbar">
        <span className="lb mr-1">Filter</span>
        <Link className={cn("chip", query.div === "all" && "on")} href={accountsHref(query, { div: "all" })}>
          All divisions
        </Link>
        {divisions.map((d) => (
          <Link key={d} className={cn("chip", query.div === d && "on")} href={accountsHref(query, { div: d })}>
            {DIVISION_LABEL[d]}
          </Link>
        ))}
        <span className="vs" />
        {HEALTH_CHIPS.map(([h, label]) => (
          <Link key={h} className={cn("chip", query.health === h && "on")} href={accountsHref(query, { health: h })}>
            {label}
          </Link>
        ))}
        <span className="vs" />
        <SearchBox initial={query.q} placeholder="Search name or code" />
        <span className="end">
          page {query.page} / {page.pages}
        </span>
      </div>

      <div className="card">
        {page.kind === "group" ? (
          <GroupTable rows={page.rows} showOwner={page.showOwner} header={<GroupHeader query={query} showOwner={page.showOwner} />} />
        ) : (
          <AccountTable page={page} query={query} />
        )}
      </div>

      <Pager query={query} pages={page.pages} total={page.summary.total} />
    </>
  );
}

function SortTh({ query, sort, label, className }: { query: AccountsQuery; sort: AccountsQuery["sort"]; label: string; className?: string }) {
  const active = query.sort === sort;
  return (
    <th className={cn(className, active && "act")} aria-sort={active ? (query.dir === "asc" ? "ascending" : "descending") : undefined}>
      <Link href={sortHref(query, sort)} scroll={false}>
        {label}
        {active ? (query.dir === "asc" ? " ↑" : " ↓") : ""}
      </Link>
    </th>
  );
}

function GroupHeader({ query, showOwner }: { query: AccountsQuery; showOwner: boolean }) {
  return (
    <thead>
      <tr>
        <SortTh query={query} sort="name" label="Customer group" />
        {showOwner && (
          <>
            <th>Segment</th>
            <th>Region</th>
            <th>Parent</th>
          </>
        )}
        <th>Level</th>
        <th className="num">Bill-tos</th>
        <th className="num">Sold-tos</th>
        {showOwner && (
          <>
            <th>Owner</th>
            <th>Rep code</th>
          </>
        )}
        <th>Health</th>
        <SortTh query={query} sort="fy" label="FY revenue" className="num" />
      </tr>
    </thead>
  );
}

function AccountTable({ page, query }: { page: Extract<AccountsPage, { kind: "account" }>; query: AccountsQuery }) {
  return (
    <div className="tbl-wrap">
      <table className="tbl">
        <thead>
          <tr>
            <SortTh query={query} sort="name" label="Name" />
            <th>Rel.</th>
            <th>Segment</th>
            {page.showOwner && <th>Owner</th>}
            <th>Health</th>
            <SortTh query={query} sort="fy" label="FY revenue" className="num" />
            <SortTh query={query} sort="tasks" label="Open tasks" className="num" />
          </tr>
        </thead>
        <tbody>
          {page.rows.length ? (
            page.rows.map((a) => (
              <tr key={a.id}>
                <td>
                  <Link className="lnk" href={`/accounts/${encodeURIComponent(a.id)}`}>
                    {a.name}
                  </Link>
                  <span className="sb">
                    {a.code} · {a.site}
                  </span>
                </td>
                <td>
                  <Badge tone="info">{a.type === "bill_to" ? "Bill-To" : "Sold-To"}</Badge>
                </td>
                <td className="text-text2">{a.segment}</td>
                {page.showOwner && <td>{a.owner}</td>}
                <td>
                  <HealthPill band={a.health} />
                </td>
                <td className="num">{money(a.fyRevenue)}</td>
                <td className="num">{a.openTasks}</td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={page.showOwner ? 7 : 6}>
                <Empty title="No accounts match">Try clearing a filter.</Empty>
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function Pager({ query, pages, total }: { query: AccountsQuery; pages: number; total: number }) {
  const prev = query.page > 1;
  const next = query.page < pages;
  return (
    <nav className="pager" aria-label="Pagination">
      <span>
        page {query.page} of {pages} · {num(total)} total
      </span>
      <div className="flex gap-1.5">
        {prev ? (
          <Link className="btn sm" href={accountsHref(query, { page: query.page - 1 })}>
            <ChevronLeft size={14} />
            Prev
          </Link>
        ) : (
          <button className="btn sm" disabled>
            <ChevronLeft size={14} />
            Prev
          </button>
        )}
        {next ? (
          <Link className="btn sm" href={accountsHref(query, { page: query.page + 1 })}>
            Next
            <ChevronRight size={14} />
          </Link>
        ) : (
          <button className="btn sm" disabled>
            Next
            <ChevronRight size={14} />
          </button>
        )}
      </div>
    </nav>
  );
}
