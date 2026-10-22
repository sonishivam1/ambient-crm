"use client";

import { X } from "lucide-react";
import { Dialog } from "radix-ui";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { completeVisit } from "@/app/actions/visits";
import { Field } from "@/components/forms/fields";
import { cn } from "@/lib/cn";
import { fmtDate } from "@/lib/format";
import { SENTIMENT_LABEL, VISIT_TYPE_LABEL, type VisitRow } from "@/lib/visits";

type Sentiment = NonNullable<VisitRow["report"]>["sentiment"];

const RATINGS = [
  ["relationship", "Relationship"],
  ["commercial", "Commercial outlook"],
  ["service", "Service"],
] as const;

function Rating({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) {
  return (
    <Field label={`${label} (1–5)`} required group>
      <div className="rateseg" role="radiogroup" aria-label={label}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" role="radio" aria-checked={value === n} className={cn(value === n && "on")} onClick={() => onChange(n)}>
            {n}
          </button>
        ))}
      </div>
    </Field>
  );
}

/** Complete a visit with its post-visit scorecard, or show the scorecard already captured. */
export function ReportDialog({ open, onOpenChange, visit, timeZone }: { open: boolean; onOpenChange: (open: boolean) => void; visit: VisitRow; timeZone: string }) {
  const [sentiment, setSentiment] = useState<Sentiment | "">("");
  const [scores, setScores] = useState({ relationship: 0, commercial: 0, service: 0 });
  const [keyPoints, setKeyPoints] = useState("");
  const [followUps, setFollowUps] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const report = visit.report;

  const submit = () =>
    startTransition(async () => {
      setError(null);
      const result = await completeVisit({ id: visit.id, sentiment, ...scores, keyPoints, followUps });
      if (!result.ok) return setError(result.error);
      toast("Visit report captured");
      onOpenChange(false);
    });

  const header = (
    <div className="flex items-start justify-between gap-3.5 px-[26px] pt-[22px] pb-1.5">
      <div>
        <Dialog.Title className="m-0 text-[20px] font-extrabold">Post-visit report</Dialog.Title>
        <Dialog.Description className="mt-1 text-[13.5px] text-muted">
          {visit.account} · {VISIT_TYPE_LABEL[visit.type]} · {fmtDate(visit.at, timeZone)}
        </Dialog.Description>
      </div>
      <Dialog.Close className="grid size-9 flex-none place-items-center rounded-full bg-surface2 text-text2" aria-label="Close">
        <X size={16} />
      </Dialog.Close>
    </div>
  );

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="ov" />
        <Dialog.Content className="modal form wide">
          {report ? (
            <>
              {header}
              <div className="m-body">
                <div className="kv">
                  <span>Sentiment</span>
                  <b>{SENTIMENT_LABEL[report.sentiment]}</b>
                </div>
                {RATINGS.map(([key, label]) => (
                  <div key={key} className="kv">
                    <span>{label}</span>
                    <b className="tnum">{report[key]} / 5</b>
                  </div>
                ))}
                <Field label="Key points" group>
                  <p className="m-0 text-[13.5px] whitespace-pre-wrap">{report.keyPoints || "—"}</p>
                </Field>
                <Field label="Follow-ups" group>
                  <p className="m-0 text-[13.5px] whitespace-pre-wrap">{report.followUps || "—"}</p>
                </Field>
                <p className="m-0 text-[12px] text-muted">
                  Captured by {report.capturedBy || "someone"} on {fmtDate(report.capturedAt, timeZone)}
                </p>
              </div>
              <div className="flex justify-end px-[26px] pt-4 pb-6">
                <Dialog.Close className="btn">Close</Dialog.Close>
              </div>
            </>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                submit();
              }}
            >
              {header}
              <div className="m-body">
                <Field label="How did it go?" required>
                  <select className="sel" value={sentiment} onChange={(e) => setSentiment(e.target.value as Sentiment)} aria-label="Sentiment">
                    {!sentiment && <option value="">Choose</option>}
                    {(Object.keys(SENTIMENT_LABEL) as Sentiment[]).map((s) => (
                      <option key={s} value={s}>
                        {SENTIMENT_LABEL[s]}
                      </option>
                    ))}
                  </select>
                </Field>
                {RATINGS.map(([key, label]) => (
                  <Rating key={key} label={label} value={scores[key]} onChange={(n) => setScores((s) => ({ ...s, [key]: n }))} />
                ))}
                <Field label="Key points">
                  <textarea className="txa" style={{ minHeight: 80 }} value={keyPoints} onChange={(e) => setKeyPoints(e.target.value)} maxLength={4000} placeholder="What happened?" />
                </Field>
                <Field label="Follow-ups">
                  <textarea className="txa" style={{ minHeight: 70 }} value={followUps} onChange={(e) => setFollowUps(e.target.value)} maxLength={4000} placeholder="What needs to happen next?" />
                </Field>
                {error && (
                  <p className="m-0 text-[13px] font-semibold text-risk" role="alert">
                    {error}
                  </p>
                )}
              </div>
              <div className="flex justify-end gap-2.5 px-[26px] pt-4 pb-6">
                <Dialog.Close type="button" className="btn">
                  Cancel
                </Dialog.Close>
                <button
                  type="submit"
                  className="btn primary"
                  disabled={pending || !sentiment || !scores.relationship || !scores.commercial || !scores.service}
                >
                  {pending ? "Saving…" : visit.status === "completed" ? "Save report" : "Complete visit"}
                </button>
              </div>
            </form>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
