import { Suspense } from "react";

import { AssistantTab } from "@/components/shell/assistant-tab";
import { CommandPalette } from "@/components/shell/command-palette";
import { ShellProvider } from "@/components/shell/shell-context";
import { SidebarFallback, SidebarSlot, TopbarFallback, TopbarSlot } from "@/components/shell/slots";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <ShellProvider>
      <Suspense fallback={<SidebarFallback />}>
        <SidebarSlot />
      </Suspense>
      <div className="main">
        <Suspense fallback={<TopbarFallback />}>
          <TopbarSlot />
        </Suspense>
        <main className="content">{children}</main>
      </div>
      {/* Reads the pathname, so it renders at request time. */}
      <Suspense fallback={null}>
        <AssistantTab />
      </Suspense>
      <CommandPalette />
    </ShellProvider>
  );
}
