import type { Metadata } from "next";

import { PlannedPage } from "@/components/ui/planned-page";

export const metadata: Metadata = { title: "Architecture" };

export default function Page() {
  return (
    <PlannedPage
      eyebrow="Help"
      title="Architecture"
      sub="How the pieces fit together."
      phase="Phase 5 · Manager and admin"
      parity={["Show the solution architecture and sync flows"]}
    />
  );
}
