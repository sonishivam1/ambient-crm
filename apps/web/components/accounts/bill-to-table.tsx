"use client";

import Link from "next/link";
import { Fragment, useState, useTransition } from "react";
import { toast } from "sonner";

import { loadChildAccounts } from "@/app/actions/accounts";
import { Empty, HealthPill } from "@/components/ui/primitives";
import type { ChildAccount } from "@/lib/data/accounts";
import { money, num } from "@/lib/format";

const accountHref = (id: string) => `/accounts/${encodeURIComponent(id)}`;

/** A group's bill-to accounts; each expands in place to its sold-tos (loaded once, then cached). */
export function BillToTable({ rows, showOwner }: { rows: ChildAccount[]; showOwner: boolean }) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [children, setChildren] = useState<Record<string, ChildAccount[] | "loading">>({});
  const [, startTransition] = useTransition();
  const span = showOwner ? 6 : 5;

  const toggle = (id: string) => {
    const next = !open[id];
    setOpen((o) => ({ ...o, [id]: next }));
    if (!next || children[id]) return;
    setChildren((c) => ({ ...c, [id]: "loading" }));
    startTransition(async () => {
      try {
        const kids = await loadChildAccounts({ kind: "billTo", id });
        setChildren((c) => ({ ...c, [id]: kids }));
      } catch {
        setChildren((c) => {
          const rest = { ...c };
          delete rest[id];
          return rest;
        });
        setOpen((o) => ({ ...o, [id]: false }));
        toast.error("Could not load those accounts.");
      }
    });
  };

  return (
    <div className="tbl-wrap">
      <table className="tbl">
        <thead>
          <tr>
            <th>Bill-to account</th>
            <th>Level</th>
            <th className="num">Sold-tos</th>
            {showOwner && <th>Owner</th>}
            <th>Health</th>
            <th className="num">FY revenue</th>
          </tr>
        </thead>
        <tbody>
          {rows.length ? (
            rows.map((b) => {
              const kids = children[b.id];
              return (
                <Fragment key={b.id}>
                  <tr>
                    <td>
                      <div className="flex items-center">
                        <button
                          className={b.children ? "exp" : "exp ghost"}
                          aria-expanded={!!open[b.id]}
                          aria-label={`${open[b.id] ? "Collapse" : "Expand"} ${b.name}`}
                          disabled={!b.children}
                          onClick={() => toggle(b.id)}
                        >
                          {open[b.id] ? "−" : "+"}
                        </button>
                        <div>
                          <Link className="lnk" href={accountHref(b.id)}>
                            {b.name}
                          </Link>
                          <span className="sb">{b.code}</span>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className="lvl">bill-to</span>
                    </td>
                    <td className="num">{b.children ? num(b.children) : ""}</td>
                    {showOwner && <td>{b.owner}</td>}
                    <td>
                      <HealthPill band={b.health} />
                    </td>
                    <td className="num">
                      <b>{money(b.fyRevenue)}</b>
                    </td>
                  </tr>
                  {open[b.id] && kids === "loading" && (
                    <tr className="child">
                      <td colSpan={span}>
                        <span className="text-muted" style={{ paddingLeft: 34 }}>
                          Loading…
                        </span>
                      </td>
                    </tr>
                  )}
                  {open[b.id] &&
                    Array.isArray(kids) &&
                    kids.map((s) => (
                      <tr key={s.id} className="child">
                        <td>
                          <div style={{ paddingLeft: 34 }}>
                            <Link className="lnk" href={accountHref(s.id)}>
                              {s.name}
                            </Link>
                            <span className="sb">{s.code}</span>
                          </div>
                        </td>
                        <td>
                          <span className="lvl">sold-to</span>
                        </td>
                        <td />
                        {showOwner && <td>{s.owner}</td>}
                        <td>
                          <HealthPill band={s.health} />
                        </td>
                        <td className="num">{money(s.fyRevenue)}</td>
                      </tr>
                    ))}
                </Fragment>
              );
            })
          ) : (
            <tr>
              <td colSpan={span}>
                <Empty title="No bill-to accounts" />
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
