"use client";

import { Plus, X } from "lucide-react";
import { Dialog } from "radix-ui";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { logInteraction } from "@/app/actions/interactions";
import { cn } from "@/lib/cn";

const TYPES = [
  ["note", "Note"],
  ["call", "Call"],
  ["meeting", "Meeting"],
] as const;
type InteractionType = (typeof TYPES)[number][0];

export function LogInteractionButton({ accountId, accountName }: { accountId: string; accountName: string }) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<InteractionType>("note");
  const [summary, setSummary] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = () =>
    startTransition(async () => {
      const result = await logInteraction({ accountId, type, summary });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast("Interaction logged");
      setSummary("");
      setType("note");
      setError(null);
      setOpen(false);
    });

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger className="btn primary">
        <Plus size={16} />
        Log interaction
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="ov" />
        <Dialog.Content className="modal form">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <div className="flex items-start justify-between gap-3.5 px-[26px] pt-[22px] pb-1.5">
              <div>
                <Dialog.Title className="m-0 text-[20px] font-extrabold">Log an interaction</Dialog.Title>
                <Dialog.Description className="mt-1 text-[13.5px] text-muted">{accountName}</Dialog.Description>
              </div>
              <Dialog.Close className="grid size-9 flex-none place-items-center rounded-full bg-surface2 text-text2" aria-label="Close">
                <X size={16} />
              </Dialog.Close>
            </div>
            <div className="flex flex-col gap-4 px-[26px] pt-3.5 pb-2">
              <div className="flex flex-col gap-1.5">
                <span className="lb">Type</span>
                <div className="seg flat self-start" role="radiogroup" aria-label="Interaction type">
                  {TYPES.map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      role="radio"
                      aria-checked={type === value}
                      className={cn(type === value && "on")}
                      onClick={() => setType(value)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <label className="flex flex-col gap-1.5">
                <span className="lb">What happened?</span>
                <textarea
                  className="txa"
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                  placeholder="Spoke with the buyer about the Q3 reorder…"
                  maxLength={4000}
                  autoFocus
                />
              </label>
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
              <button type="submit" className="btn primary" disabled={pending || !summary.trim()}>
                {pending ? "Saving…" : "Log interaction"}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
