import type { Metadata } from "next";

import { PlannedPage } from "@/components/ui/planned-page";

export const metadata: Metadata = { title: "Admin home" };

export default function Page() {
  return (
    <PlannedPage
      eyebrow="Admin"
      title="Admin home"
      sub="Administration and support tools."
      phase="Phase 5 · Manager and admin"
      parity={["Entry point to sync health, audit log and user tools"]}
    />
  );
}
