import type { Metadata } from "next";

import { PlannedPage } from "@/components/ui/planned-page";

export const metadata: Metadata = { title: "View as" };

export default function Page() {
  return (
    <PlannedPage
      eyebrow="Admin"
      title="View as"
      sub="See the CRM as another user."
      phase="Phase 5 · Manager and admin"
      parity={["Super admins impersonate a user with an audited, time-limited session", "Excluded from production builds unless explicitly gated"]}
    />
  );
}
