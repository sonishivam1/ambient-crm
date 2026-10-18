import { Suspense } from "react";

import { CaraTab } from "@/components/shell/cara-tab";
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
      <CaraTab />
      <CommandPalette />
    </ShellProvider>
  );
}
