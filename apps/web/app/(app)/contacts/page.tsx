import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { AddContactButton, ContactRowActions } from "@/components/contacts/contact-controls";
import { ContactsFilterBar } from "@/components/contacts/filter-bar";
import { Avatar, Badge, Empty, PageHead, Skeleton } from "@/components/ui/primitives";
import { contactsQuerySchema, getContactOptions, getContactsPage, type ContactsQuery } from "@/lib/data/contacts";
import { fmtDate, num } from "@/lib/format";

export const metadata: Metadata = { title: "Contacts" };

type RawParams = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default function ContactsPage({ searchParams }: PageProps<"/contacts">) {
  return (
    <Suspense fallback={<ContactsSkeleton />}>
      <ContactsContent searchParams={searchParams} />
    </Suspense>
  );
}

function ContactsSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading contacts">
      <Skeleton className="mt-2.5 mb-3 h-3 w-20" />
      <Skeleton className="mb-6 h-8 w-72" />
      <Skeleton className="mb-4 h-14 rounded-[20px]" />
      <Skeleton className="h-[520px] rounded-[22px]" />
    </div>
  );
}

function pageHref(raw: RawParams, page: number) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(raw)) {
    const value = first(v);
    if (value && k !== "new" && k !== "page") params.set(k, value);
  }
  if (page > 1) params.set("page", String(page));
  const qs = params.toString();
  return qs ? `/contacts?${qs}` : "/contacts";
}

async function ContactsContent({ searchParams }: { searchParams: Promise<RawParams> }) {
  const raw = await searchParams;
  const query: ContactsQuery = contactsQuerySchema.parse(Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, first(v)])));
  const [page, options] = await Promise.all([getContactsPage(query), getContactOptions()]);

  return (
    <>
      <PageHead
        eyebrow="Contacts"
        title="Contact directory"
        meta={`· ${num(page.total)} ${page.total === 1 ? "contact" : "contacts"}`}
        sub="Ambient's own record of who's who across your accounts."
        actions={<AddContactButton roles={options.roles} openFromUrl />}
      />
      <ContactsFilterBar accounts={options.accounts} roles={options.roles} query={query} />

      <div className="card">
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Name</th>
                <th>Job title</th>
                <th>Account</th>
                <th>Bill-to</th>
                <th>Site</th>
                <th>Email</th>
                <th>Phone</th>
                <th>Status</th>
                <th>Updated</th>
                <th className="num">Actions</th>
              </tr>
            </thead>
            <tbody>
              {page.rows.length ? (
                page.rows.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <div className="flex items-center gap-2.5">
                        <Avatar name={c.name} size="sm" />
                        <div className="min-w-0">
                          <span className="nm">{c.name}</span>
                          {c.roleLabels.length > 0 && (
                            <div className="mt-1 flex flex-wrap gap-1">
                              {c.roleLabels.map((r) => (
                                <Badge key={r} tone="out">
                                  {r}
                                </Badge>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="whitespace-nowrap text-text2">{c.jobTitle || "—"}</td>
                    <td className="whitespace-nowrap">
                      <Link className="lnk" href={`/accounts/${encodeURIComponent(c.accountId)}`}>
                        {c.account}
                      </Link>
                    </td>
                    <td className="mono">{c.accountCode}</td>
                    <td className="mono">
                      {c.soldTo ? (
                        <Link className="lnk" href={`/accounts/${encodeURIComponent(c.soldTo.id)}`} title={c.soldTo.name}>
                          {c.soldTo.code}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="whitespace-nowrap">
                      {c.email ? (
                        <a className="lnk" href={`mailto:${c.email}`}>
                          {c.email}
                        </a>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="tnum whitespace-nowrap">{c.phone ? <a href={`tel:${c.phone.replace(/[^0-9+]/g, "")}`}>{c.phone}</a> : "—"}</td>
                    <td>
                      <Badge tone={c.active ? "ok" : "out"}>{c.active ? "Active" : "Inactive"}</Badge>
                    </td>
                    <td className="tnum whitespace-nowrap text-text2">{fmtDate(c.updatedAt, options.timeZone)}</td>
                    <td className="num">
                      <ContactRowActions contact={c} active={c.active} roles={options.roles} />
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={10}>
                    <Empty title={query.q || query.role || query.account ? "No contacts match these filters" : "No contacts yet"}>
                      Add the people you deal with at each account.
                    </Empty>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <nav className="pager" aria-label="Pagination">
        <span>
          page {query.page} of {page.pages} · {num(page.total)} {page.total === 1 ? "contact" : "contacts"}
        </span>
        <div className="flex gap-1.5">
          {query.page > 1 ? (
            <Link className="btn sm" href={pageHref(raw, query.page - 1)}>
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
            <Link className="btn sm" href={pageHref(raw, query.page + 1)}>
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
    </>
  );
}
