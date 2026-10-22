import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { Card, Empty, PageHead, ProgressBar, Skeleton } from "@/components/ui/primitives";
import { FEEDBACK_REASONS } from "@/lib/ai/feedback-view";
import { getAiReport, type AiReport } from "@/lib/data/ai-report";
import { num } from "@/lib/format";

export const metadata: Metadata = { title: "AI usage" };

const FEATURE_LABEL: Record<string, string> = {
  "account-summary": "Account summary",
  "morning-brief": "Morning brief",
  "wren-chat": "Wren chat",
  "followup-suggestions": "Follow-up suggestions",
};
const REFUSAL_LABEL: Record<string, string> = {
  not_configured: "AI not set up",
  ai_disabled: "AI turned off",
  feature_disabled: "Feature turned off",
  role_not_allowed: "Role not allowed",
  budget_exhausted: "Budget used up",
  rate_limited: "Rate limited",
};
const REASON_LABEL = Object.fromEntries(FEEDBACK_REASONS);
const label = (feature: string) => FEATURE_LABEL[feature] ?? feature;
const usd = (n: number | null) => (n == null ? "—" : `$${n.toFixed(n < 1 ? 4 : 2)}`);

export default function Page() {
  return (
    <Suspense fallback={<Skeleton className="h-[420px] rounded-[22px]" />}>
      <AiUsage />
    </Suspense>
  );
}

/** Admins only. Totals from metadata; no question, answer or customer text appears here. */
async function AiUsage() {
  const report = await getAiReport();
  if (!report) notFound();
  return (
    <>
      <PageHead
        eyebrow="Admin"
        title="AI usage"
        sub={`${report.month} · totals for your organisation. Questions and answers stay private to each user and never appear here.`}
      />
      <div className="flex flex-col gap-[18px]">
        <Budget report={report} />
        <Usage report={report} />
        <Feedback report={report} />
        <Proposals report={report} />
      </div>
    </>
  );
}

function Budget({ report }: { report: AiReport }) {
  const { used, reserved, limit, enabled } = report.budget;
  const pct = limit ? Math.round(((used + reserved) / limit) * 100) : 0;
  return (
    <Card title="Monthly token budget">
      {enabled ? (
        <>
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2 text-[13.5px]">
            <b className="text-[20px]">{num(used)}</b>
            <span className="text-muted">
              of {num(limit)} tokens used{reserved ? ` · ${num(reserved)} reserved by calls in progress` : ""} · {pct}%
            </span>
          </div>
          <ProgressBar pct={pct} tone={pct >= 90 ? "risk" : "dark"} />
        </>
      ) : (
        <p className="m-0 text-[13.5px] text-muted">AI is turned off for your organisation.</p>
      )}
    </Card>
  );
}

function Usage({ report }: { report: AiReport }) {
  return (
    <Card title="Requests by feature">
      {report.usage.length ? (
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Feature</th>
                <th className="num">Model calls</th>
                <th className="num">From cache</th>
                <th className="num">Refused</th>
                <th className="num">Failed</th>
                <th className="num">Rejected</th>
                <th className="num">Tokens in / out</th>
                <th className="num">Avg time</th>
                <th className="num">Est. cost</th>
              </tr>
            </thead>
            <tbody>
              {report.usage.map((u) => (
                <tr key={u.feature}>
                  <td>
                    <b>{label(u.feature)}</b>
                  </td>
                  <td className="num">{num(u.calls)}</td>
                  <td className="num">{num(u.cached)}</td>
                  <td className="num">{num(u.refused)}</td>
                  <td className="num">{num(u.failed)}</td>
                  <td className="num">{num(u.rejected)}</td>
                  <td className="num">
                    {num(u.inputTokens)} / {num(u.outputTokens)}
                  </td>
                  <td className="num">{u.avgLatencyMs == null ? "—" : `${(u.avgLatencyMs / 1000).toFixed(1)}s`}</td>
                  <td className="num">{usd(u.cost)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty title="No AI requests this month" />
      )}
      {report.refusals.length > 0 && (
        <p className="mt-3 mb-0 text-[12.5px] text-muted">
          Refusals: {report.refusals.map((r) => `${REFUSAL_LABEL[r.reason] ?? r.reason} ${num(r.count)}`).join(" · ")}
        </p>
      )}
      {!report.pricesSet && (
        <p className="mt-2 mb-0 text-[12.5px] text-muted">Set OPENAI_PRICE_INPUT_PER_M and OPENAI_PRICE_OUTPUT_PER_M to see estimated costs.</p>
      )}
    </Card>
  );
}

function Feedback({ report }: { report: AiReport }) {
  return (
    <Card title="Feedback by feature and prompt version">
      {report.feedback.length ? (
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Feature</th>
                <th className="num">Prompt</th>
                <th className="num">Votes</th>
                <th>Helpful</th>
                <th>Top reasons for 👎</th>
              </tr>
            </thead>
            <tbody>
              {report.feedback.map((f) => {
                const votes = f.up + f.down;
                const share = votes ? Math.round((f.up / votes) * 100) : 0;
                const reasons = Object.entries(f.reasons).sort((a, b) => b[1] - a[1]);
                return (
                  <tr key={`${f.feature}-${f.promptVersion}`}>
                    <td>
                      <b>{label(f.feature)}</b>
                    </td>
                    <td className="num">v{f.promptVersion}</td>
                    <td className="num">{num(votes)}</td>
                    <td>
                      <div className="flex min-w-[140px] items-center gap-2">
                        <ProgressBar pct={share} tone={share >= 70 ? "ok" : share < 50 ? "risk" : "dark"} />
                        <span className="text-[12.5px]">{share}%</span>
                      </div>
                    </td>
                    <td className="text-[12.5px] text-muted">{reasons.length ? reasons.map(([r, n]) => `${REASON_LABEL[r] ?? r} ${n}`).join(" · ") : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty title="No feedback yet this month">People can rate summaries, briefs and chat answers with 👍 or 👎.</Empty>
      )}
    </Card>
  );
}

function Proposals({ report }: { report: AiReport }) {
  const ORIGIN = { chat: "From chat", followups: "Follow-up suggestions" } as const;
  return (
    <Card title="Proposals">
      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>Source</th>
              <th className="num">Prepared</th>
              <th className="num">Accepted</th>
              <th className="num">Dismissed</th>
              <th className="num">Expired</th>
              <th className="num">Waiting</th>
            </tr>
          </thead>
          <tbody>
            {report.proposals.map((p) => (
              <tr key={p.origin}>
                <td>
                  <b>{ORIGIN[p.origin]}</b>
                </td>
                <td className="num">{num(p.prepared)}</td>
                <td className="num">
                  {num(p.accepted)}
                  {p.prepared ? <span className="text-muted"> ({Math.round((p.accepted / p.prepared) * 100)}%)</span> : null}
                </td>
                <td className="num">{num(p.dismissed)}</td>
                <td className="num">{num(p.expired)}</td>
                <td className="num">{num(p.pending)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
