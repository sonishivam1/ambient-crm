import type { Metadata } from "next";

import { PlannedPage } from "@/components/ui/planned-page";

export const metadata: Metadata = { title: "Audit log" };

export default function Page() {
  return (
    <PlannedPage
      eyebrow="Admin"
      title="Audit log"
      sub="Every write, with before and after state."
      phase="Phase 5 · Manager and admin"
      parity={["Filter by actor, entity and action", "Never shows note or email bodies"]}
    />
  );
}
