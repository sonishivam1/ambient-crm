import type { Metadata } from "next";

import { PlannedPage } from "@/components/ui/planned-page";

export const metadata: Metadata = { title: "Notifications" };

export default function Page() {
  return (
    <PlannedPage
      eyebrow="Workspace"
      title="Notifications"
      sub="Everything that needs your attention."
      phase="Phase 2 · Core CRM"
      parity={["Full notification history with read and unread state", "Mark as read, jump to the related account"]}
    />
  );
}
