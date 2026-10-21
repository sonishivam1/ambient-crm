"use client";

import { Sparkles, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { Dialog } from "radix-ui";
import { useState, useTransition } from "react";

import { loadWrenPanel } from "@/app/actions/ai";
import { WrenChat } from "@/components/ai/wren-chat";
import { Skeleton } from "@/components/ui/primitives";
import type { PanelData } from "@/lib/ai/panel";

/**
 * The side tab that opens Wren as a slide-out panel on any page (hidden on
 * the full-page assistant). The panel continues the user's latest
 * conversation and knows the page it's opened on. Escape or the close button
 * closes it, and focus returns to the tab.
 */
export function AssistantTab() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<PanelData | null>(null);
  const [failed, setFailed] = useState(false);
  const [pending, start] = useTransition();

  if (pathname === "/assistant") return null;

  const load = () =>
    start(async () => {
      setFailed(false);
      try {
        setData(await loadWrenPanel(pathname));
      } catch {
        setFailed(true);
      }
    });

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        // Fresh each time: the page, and the latest conversation, may have changed.
        if (next) load();
      }}
    >
      <Dialog.Trigger className="assistant-tab" aria-label="Ask Wren">
        <Sparkles size={18} />
        <span style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}>WREN</span>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="wren-drawer-ov" />
        <Dialog.Content className="wren-drawer" aria-describedby={undefined}>
          <div className="wren-drawer-head">
            <span className="ic" aria-hidden>
              <Sparkles size={16} />
            </span>
            <Dialog.Title className="m-0 text-[16px] font-extrabold">Wren</Dialog.Title>
            <Dialog.Close className="btn icon sm ghost ml-auto" aria-label="Close Wren">
              <X size={16} />
            </Dialog.Close>
          </div>
          {pending || !data ? (
            failed ? (
              <p role="alert" className="m-5 text-[13.5px] font-semibold text-risk">
                Couldn&apos;t open Wren. Try again in a moment.
              </p>
            ) : (
              <div className="p-5" aria-busy="true" aria-label="Opening Wren">
                <Skeleton className="mb-3 h-14 rounded-[14px]" />
                <Skeleton className="h-24 rounded-[14px]" />
              </div>
            )
          ) : (
            <WrenChat
              key={data.conversationId ?? "new"}
              mode="panel"
              conversations={data.conversations}
              conversationId={data.conversationId}
              turns={data.turns}
              unavailable={data.unavailable}
              suggestions={data.suggestions}
              proposalCtx={data.proposalCtx}
            />
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
