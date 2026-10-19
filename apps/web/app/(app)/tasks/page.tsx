import { ChevronLeft, ChevronRight, Sparkles } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import type { Division, Task } from "@ambient/db";

import { TaskCheck } from "@/components/dashboard/task-check";
import { TasksFilterBar } from "@/components/tasks/filter-bar";
import { AddTaskButton, TaskRowMenu } from "@/components/tasks/task-controls";
import { Badge, Empty, PageHead, Skeleton, type Tone } from "@/components/ui/primitives";
import { cn } from "@/lib/cn";
import { getTaskOptions, getTasksPage, getTodayTasks, tasksQuerySchema, type TaskOptions, type TaskRow, type TasksQuery } from "@/lib/data/tasks";
import { fmtDate, num } from "@/lib/format";

export const metadata: Metadata = { title: "Tasks" };

type RawParams = Record<string, string | string[] | undefined>;

const DIVISION_LABEL: Record<Division, string> = { wholesale: "Wholesale", uniforms: "Uniforms", icw: "ICW", other: "Other" };
const PRIORITY: Record<Task["priority"], [string, Tone]> = { high: ["High", "risk"], normal: ["Medium", "warn"], low: ["Low", "out"] };
const SOURCE: Record<Task["source"], [string, Tone]> = { manual: ["Manual", "out"], ai: ["Wren", "accent"], manager_assigned: ["Manager assigned", "info"] };
const STATUS: Record<Task["status"], [string, Tone]> = {
  open: ["Open", "out"],
  in_progress: ["In progress", "info"],
  completed: ["Completed", "ok"],
  cancelled: ["Cancelled", "out"],
};

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default function TasksPage({ searchParams }: PageProps<"/tasks">) {
  return (
    <Suspense fallback={<TasksSkeleton />}>
      <TasksContent searchParams={searchParams} />
    </Suspense>
  );
}

function TasksSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading tasks">
      <Skeleton className="mt-2.5 mb-3 h-3 w-20" />
      <Skeleton className="mb-6 h-8 w-64" />
      <Skeleton className="mb-5 h-11 w-44 rounded-full" />
      <Skeleton className="mb-[18px] h-[220px] rounded-[22px]" />
      <Skeleton className="h-[220px] rounded-[22px]" />
    </div>
  );
}

async function TasksContent({ searchParams }: { searchParams: Promise<RawParams> }) {
  const raw = await searchParams;
  const query = tasksQuerySchema.parse(Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, first(v)])));
  const options = await getTaskOptions();
  const assign = { canAssign: options.canAssign, assignable: options.assignable, ownRepId: options.ownRepId };

  return (
    <>
      <PageHead
        eyebrow="Tasks"
        title={options.title}
        sub={
          query.view === "today"
            ? "Overdue and due today. Switch to All for the full list."
            : "Filter, sort and manage every task you can see."
        }
        actions={<AddTaskButton {...assign} openFromUrl />}
      />

      <nav className="seg mb-[18px]" aria-label="Task view">
        <Link href="/tasks" className={cn(query.view === "today" && "on")} aria-current={query.view === "today" ? "page" : undefined}>
          Today
        </Link>
        <Link href="/tasks?view=all" className={cn(query.view === "all" && "on")} aria-current={query.view === "all" ? "page" : undefined}>
          All
        </Link>
      </nav>

      {query.view === "today" ? <TodayView options={options} /> : <AllView query={query} raw={raw} options={options} />}
    </>
  );
}

async function TodayView({ options }: { options: TaskOptions }) {
  const { overdue, dueToday } = await getTodayTasks();
  const assign = { canAssign: options.canAssign, assignable: options.assignable, ownRepId: options.ownRepId };
  const section = (label: string, rows: TaskRow[], accent: boolean, empty: string) => (
    <div className="card">
      <div className="wkh">
        <span className="eb" style={{ color: accent ? "var(--accent)" : "var(--text)" }}>
          {label} · {rows.length}
        </span>
      </div>
      {rows.length ? (
        rows.map((t) => (
          <div key={t.id} className="li items-center" style={{ padding: "14px 22px" }}>
            <TaskCheck id={t.id} title={t.title} done={false} />
            <div className="min-w-0 flex-1">
              <Link className="text-[11px] font-bold tracking-[0.1em] text-muted uppercase hover:text-accent" href={`/accounts/${encodeURIComponent(t.accountId)}`}>
                {t.account}
              </Link>
              <b className="mt-0.5 block">{t.title}</b>
              {options.canAssign && <p>{t.owner}</p>}
            </div>
            <Badge tone={PRIORITY[t.priority][1]}>{PRIORITY[t.priority][0]}</Badge>
            <span className="tnum text-[13px] whitespace-nowrap text-muted">{fmtDate(t.dueAt)}</span>
            {t.overdue && <Badge tone="risk">Overdue</Badge>}
            <TaskRowMenu task={t} {...assign} />
          </div>
        ))
      ) : (
        <div className="empty">{empty}</div>
      )}
    </div>
  );

  return (
    <div className="flex flex-col gap-[18px]">
      {section("Overdue", overdue, true, "Nothing overdue. You're on top of it.")}
      {section("Due today", dueToday, false, "Nothing due today.")}
      <div className="card">
        <div className="wkh">
          <span className="eb">Wren suggestions</span>
        </div>
        <div className="li" style={{ padding: "16px 22px" }}>
          <span className="ic acc">
            <Sparkles size={17} />
          </span>
          <div className="min-w-0 flex-1">
            <b>Suggested follow-ups from customer conversations</b>
            <p>Wren will draft tasks from captured email and meetings for you to accept or dismiss. Arrives with capture and the AI layer.</p>
          </div>
        </div>
      </div>
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
  params.set("view", "all");
  return `/tasks?${params.toString()}`;
}

async function AllView({ query, raw, options }: { query: TasksQuery; raw: RawParams; options: TaskOptions }) {
  const page = await getTasksPage(query);
  const assign = { canAssign: options.canAssign, assignable: options.assignable, ownRepId: options.ownRepId };
  const sortTh = (label: string, key: TasksQuery["sort"]) => {
    const active = query.sort === key;
    const dir = active ? (query.dir === "asc" ? "desc" : "asc") : key === "created" ? "desc" : "asc";
    return (
      <th className={cn(active && "act")} aria-sort={active ? (query.dir === "asc" ? "ascending" : "descending") : undefined}>
        <Link href={hrefWith(raw, { sort: key, dir, page: null })} scroll={false}>
          {label}
          {active ? (query.dir === "asc" ? " ↑" : " ↓") : ""}
        </Link>
      </th>
    );
  };
  const cols = 9 + (options.showDivision ? 1 : 0) + (options.canAssign ? 1 : 0);

  return (
    <>
      <TasksFilterBar
        accounts={options.accounts}
        assignees={options.assignees}
        divisions={options.divisions.map((d) => ({ value: d, label: DIVISION_LABEL[d] }))}
        showDivision={options.showDivision}
        showAssignee={options.canAssign}
      />
      <div className="card">
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                {options.showDivision && <th>Division</th>}
                <th>Customer account</th>
                <th>Task</th>
                {options.canAssign && <th>Assigned to</th>}
                {sortTh("Due", "due")}
                {sortTh("Priority", "priority")}
                <th>Status</th>
                <th>Source</th>
                {sortTh("Created", "created")}
                <th>Created by</th>
                <th className="num">Actions</th>
              </tr>
            </thead>
            <tbody>
              {page.rows.length ? (
                page.rows.map((t) => {
                  const [statusLabel, statusTone] = t.overdue ? (["Overdue", "risk"] as [string, Tone]) : STATUS[t.status];
                  const done = t.status === "completed";
                  return (
                    <tr key={t.id}>
                      {options.showDivision && <td className="text-text2">{DIVISION_LABEL[t.division]}</td>}
                      <td>
                        <Link className="lnk" href={`/accounts/${encodeURIComponent(t.accountId)}`}>
                          {t.account}
                        </Link>
                      </td>
                      <td>
                        <span className={cn("font-bold", done && "text-muted line-through")}>{t.title}</span>
                      </td>
                      {options.canAssign && <td className="text-text2">{t.owner}</td>}
                      <td className={cn("tnum whitespace-nowrap", t.overdue && "font-bold text-risk")}>{fmtDate(t.dueAt)}</td>
                      <td>
                        <Badge tone={PRIORITY[t.priority][1]}>{PRIORITY[t.priority][0]}</Badge>
                      </td>
                      <td>
                        <Badge tone={statusTone}>{statusLabel}</Badge>
                      </td>
                      <td>
                        <Badge tone={SOURCE[t.source][1]}>{SOURCE[t.source][0]}</Badge>
                      </td>
                      <td className="tnum whitespace-nowrap text-text2">{fmtDate(t.createdAt)}</td>
                      <td className="text-text2">{t.createdBy}</td>
                      <td className="num">
                        <TaskRowMenu task={t} {...assign} />
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={cols}>
                    <Empty title="No tasks match these filters" />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      <nav className="pager" aria-label="Pagination">
        <span>
          page {query.page} of {page.pages} · {num(page.total)} {page.total === 1 ? "task" : "tasks"}
        </span>
        <div className="flex gap-1.5">
          {query.page > 1 ? (
            <Link className="btn sm" href={hrefWith(raw, { page: String(query.page - 1) })}>
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
            <Link className="btn sm" href={hrefWith(raw, { page: String(query.page + 1) })}>
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
