"use client";

import Link from "next/link";
import { Fragment, useState, useTransition, type ReactNode } from "react";
import { toast } from "sonner";

import { loadChildAccounts } from "@/app/actions/accounts";
import { Empty, HealthPill } from "@/components/ui/primitives";
import type { ChildAccount, GroupRow } from "@/lib/data/accounts";
import { money, num } from "@/lib/format";

type Children = Record<string, ChildAccount[] | "loading">;

const accountHref = (id: string) => `/accounts/${encodeURIComponent(id)}`;

/**
 * Customer groups with in-place drill-down: a group expands to its bill-tos,
 * a bill-to to its sold-tos. Children load on first expand and are cached.
 */
export function GroupTable({ rows, showOwner, header }: { rows: GroupRow[]; showOwner: boolean; header: ReactNode }) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [children, setChildren] = useState<Children>({});
  const [, startTransition] = useTransition();

  const toggle = (kind: "group" | "billTo", id: string) => {
    const next = !open[id];
    setOpen((o) => ({ ...o, [id]: next }));
    if (!next || children[id]) return;
    setChildren((c) => ({ ...c, [id]: "loading" }));
    startTransition(async () => {
      try {
        const rows = await loadChildAccounts({ kind, id });
        setChildren((c) => ({ ...c, [id]: rows }));
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

  const span = showOwner ? 11 : 6;
  const ownerCells = (owner: string, code = "") =>
    showOwner ? (
      <>
        <td>{owner}</td>
        <td className="mono text-text2">{code}</td>
      </>
    ) : null;
  const blankHierarchy = showOwner ? (
    <>
      <td />
      <td />
      <td />
    </>
  ) : null;

  const loadingRow = (key: string, indent: number) => (
    <tr key={`${key}-loading`} className="child">
      <td colSpan={span}>
        <span className="text-muted" style={{ paddingLeft: indent }}>
          Loading…
        </span>
      </td>
    </tr>
  );

  if (!rows.length) {
    return (
      <div className="tbl-wrap">
        <table className="tbl">
          {header}
          <tbody>
            <tr>
              <td colSpan={span}>
                <Empty title="No customer groups match">Try clearing a filter.</Empty>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="tbl-wrap">
      <table className="tbl">
        {header}
        <tbody>
          {rows.map((g) => {
            const kids = children[g.id];
            return (
              <Fragment key={g.id}>
                <tr>
                  <td>
                    <div className="flex items-center">
                      <button
                        className="exp"
                        aria-expanded={!!open[g.id]}
                        aria-label={`${open[g.id] ? "Collapse" : "Expand"} ${g.name}`}
                        onClick={() => toggle("group", g.id)}
                      >
                        {open[g.id] ? "−" : "+"}
                      </button>
                      <div>
                        <Link className="lnk" href={`/accounts/group/${encodeURIComponent(g.id)}`}>
                          {g.name}
                        </Link>
                        <span className="sb">{g.code}</span>
                      </div>
                    </div>
                  </td>
                  {showOwner && (
                    <>
                      <td className="text-text2">{g.hierarchy.cg3}</td>
                      <td className="text-text2">{g.hierarchy.cg2}</td>
                      <td className="text-text2">{g.hierarchy.cg1}</td>
                    </>
                  )}
                  <td>
                    <span className="lvl">{g.level}</span>
                  </td>
                  <td className="num">{num(g.billToCount)}</td>
                  <td className="num">{num(g.soldToCount)}</td>
                  {ownerCells(g.owner, g.ownerCode)}
                  <td>
                    <HealthPill band={g.health} />
                  </td>
                  <td className="num">
                    <b>{money(g.fyRevenue)}</b>
                  </td>
                </tr>
                {open[g.id] && kids === "loading" && loadingRow(g.id, 34)}
                {open[g.id] &&
                  Array.isArray(kids) &&
                  kids.map((b) => {
                    const sold = children[b.id];
                    return (
                      <Fragment key={b.id}>
                        <tr className="child">
                          <td>
                            <div className="flex items-center" style={{ paddingLeft: 34 }}>
                              <button
                                className={b.children ? "exp" : "exp ghost"}
                                aria-expanded={!!open[b.id]}
                                aria-label={`${open[b.id] ? "Collapse" : "Expand"} ${b.name}`}
                                disabled={!b.children}
                                onClick={() => toggle("billTo", b.id)}
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
                          {blankHierarchy}
                          <td>
                            <span className="lvl">bill-to</span>
                          </td>
                          <td />
                          <td className="num">{b.children ? num(b.children) : ""}</td>
                          {ownerCells(b.owner)}
                          <td>
                            <HealthPill band={b.health} />
                          </td>
                          <td className="num">{money(b.fyRevenue)}</td>
                        </tr>
                        {open[b.id] && sold === "loading" && loadingRow(b.id, 78)}
                        {open[b.id] &&
                          Array.isArray(sold) &&
                          sold.map((x) => (
                            <tr key={x.id} className="child">
                              <td>
                                <div style={{ paddingLeft: 78 }}>
                                  <Link className="lnk" href={accountHref(x.id)}>
                                    {x.name}
                                  </Link>
                                  <span className="sb">{x.code}</span>
                                </div>
                              </td>
                              {blankHierarchy}
                              <td>
                                <span className="lvl">sold-to</span>
                              </td>
                              <td />
                              <td />
                              {ownerCells(x.owner)}
                              <td>
                                <HealthPill band={x.health} />
                              </td>
                              <td className="num">{money(x.fyRevenue)}</td>
                            </tr>
                          ))}
                      </Fragment>
                    );
                  })}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
