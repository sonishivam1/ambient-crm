import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { SearchBox } from "@/components/accounts/search-box";
import { Badge, Empty, PageHead, Skeleton } from "@/components/ui/primitives";
import { cn } from "@/lib/cn";
import { BAND, RENEWAL_BANDS, daysLeftLabel, type RenewalBand } from "@/lib/contracts";
import { contractsQuerySchema, getContractsPage, type ContractsQuery } from "@/lib/data/contracts";
import { fmtDate, money, num } from "@/lib/format";

export const metadata: Metadata = { title: "Contracts" };

type RawParams = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const CARD_LABEL: Partial<Record<RenewalBand, string>> = {
  expired: "Ended in the last 90 days",
  "30": "Renew within 30 days",
  "60": "Renew in 31–60 days",
  "90": "Renew in 61–90 days",
};
const TONE_COLOR: Record<(typeof BAND)[RenewalBand]["tone"], string> = { risk: "var(--risk)", warn: "var(--warn)", info: "var(--info)", out: "var(--text2)" };

export default function ContractsPage({ searchParams }: PageProps<"/contracts">) {
  return (
    <Suspense fallback={<ContractsSkeleton />}>
      <ContractsContent searchParams={searchParams} />
    </Suspense>
  );
}

function ContractsSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading contracts">
      <Skeleton className="mt-2.5 mb-3 h-3 w-20" />
      <Skeleton className="mb-6 h-8 w-72" />
      <div className="mb-5 grid gap-[18px] md:grid-cols-3">
        <Skeleton className="h-[110px] rounded-[22px]" />
        <Skeleton className="h-[110px] rounded-[22px]" />
        <Skeleton className="h-[110px] rounded-[22px]" />
      </div>
      <Skeleton className="h-[480px] rounded-[22px]" />
    </div>
  );
}

function href(query: ContractsQuery, patch: Partial<ContractsQuery>) {
  const next = { ...query, page: 1, ...patch };
  const params = new URLSearchParams();
  if (next.band) params.set("band", next.band);
  if (next.q) params.set("q", next.q);
  if (next.account) params.set("account", next.account);
  if (next.sort !== "end") params.set("sort", next.sort);
  if (next.page > 1) params.set("page", String(next.page));
  const qs = params.toString();
  return qs ? `/contracts?${qs}` : "/contracts";
}

async function ContractsContent({ searchParams }: { searchParams: Promise<RawParams> }) {
  const raw = await searchParams;
  const query = contractsQuerySchema.parse(Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, first(v)])));
  const page = await getContractsPage(query);
  // Lapsed contracts lead when there are any: they are the most urgent.
  const cards: RenewalBand[] = page.counts.expired ? ["expired", "30", "60", "90"] : ["30", "60", "90"];
  const cols = 5 + (page.showOwner ? 1 : 0);

  return (
    <>
      <PageHead
        eyebrow="Contracts"
        title="Renewals and key dates"
        meta={`· ${num(page.total)} ${page.total === 1 ? "contract" : "contracts"}`}
        sub="Contract headers from your systems, soonest renewal first. Contracts ended in the last 90 days stay here so a lapse isn't missed."
      />

      <div className={cn("mb-5 grid gap-[18px]", cards.length === 4 ? "md:grid-cols-4" : "md:grid-cols-3")}>
        {cards.map((b) => {
          const color = TONE_COLOR[BAND[b].tone];
          const on = query.band === b;
          return (
            <Link
              key={b}
              href={href(query, { band: on ? "" : b })}
              scroll={false}
              className={cn("card kpi", on && "ring-2 ring-accent")}
              style={{ borderTop: `4px solid ${color}` }}
              aria-pressed={on}
            >
              <div className="v tnum" style={{ color }}>
                {num(page.counts[b])}
              </div>
              <div className="lb">{CARD_LABEL[b]}</div>
            </Link>
          );
        })}
      </div>

      <div className="fbar">
        <SearchBox key={query.q ? "q" : "empty"} initial={query.q} placeholder="Search contract, number or account" />
        <span className="vs" />
        <Link className={cn("chip", !query.band && "on")} href={href(query, { band: "" })} scroll={false}>
          All
        </Link>
        {RENEWAL_BANDS.map((b) => (
          <Link key={b} className={cn("chip", query.band === b && "on")} href={href(query, { band: b })} scroll={false}>
            {BAND[b].label} · {num(page.counts[b])}
          </Link>
        ))}
        <span className="end">
          <span className="lb mr-1">Sort</span>
          <Link className={cn("chip", query.sort === "end" && "on")} href={href(query, { sort: "end" })} scroll={false}>
            Soonest
          </Link>
          <Link className={cn("chip", query.sort === "value" && "on")} href={href(query, { sort: "value" })} scroll={false}>
            Largest
          </Link>
        </span>
      </div>

      <div className="card">
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Contract</th>
                <th>Account</th>
                {page.showOwner && <th>Owner</th>}
                <th className="num">Value</th>
                <th>Ends</th>
                <th className="num">Renewal</th>
              </tr>
            </thead>
            <tbody>
              {page.rows.length ? (
                page.rows.map((k) => (
                  <tr key={k.id}>
                    <td>
                      <span className="nm">{k.name}</span>
                      <div className="text-[12px] text-muted">
                        <span className="mono">{k.number}</span> · since {fmtDate(k.startDate, page.timeZone)}
                      </div>
                    </td>
                    <td className="min-w-[180px] whitespace-normal">
                      <Link className="lnk" href={`/accounts/${encodeURIComponent(k.accountId)}`}>
                        {k.account}
                      </Link>
                    </td>
                    {page.showOwner && <td className="text-text2">{k.owner}</td>}
                    <td className="num tnum">{money(k.value)}</td>
                    <td className={cn("tnum whitespace-nowrap", k.band === "expired" && "font-bold text-risk")}>{fmtDate(k.endDate, page.timeZone)}</td>
                    <td className="num whitespace-nowrap">
                      <Badge tone={BAND[k.band].tone}>{daysLeftLabel(k.daysLeft)}</Badge>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={cols}>
                    <Empty title={query.band || query.q || query.account ? "No contracts match these filters" : "No contracts yet"}>
                      Contracts arrive with the sync from your systems.
                    </Empty>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {page.pages > 1 && (
        <nav className="pager" aria-label="Pagination">
          <span>
            page {query.page} of {page.pages} · {num(page.total)} contracts
          </span>
          <div className="flex gap-1.5">
            {query.page > 1 ? (
              <Link className="btn sm" href={href(query, { page: query.page - 1 })}>
                <ChevronLeft size={14} />
                Prev
              </Link>
            ) : (
              <button className="btn sm" disabled>
                <ChevronLeft size={14} />
                Prev
              </button>
            )}
            {query.page < page.pages ? (
              <Link className="btn sm" href={href(query, { page: query.page + 1 })}>
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
      )}
    </>
  );
}
