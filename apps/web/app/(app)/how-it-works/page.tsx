import type { Metadata } from "next";

import { PlannedPage } from "@/components/ui/planned-page";

export const metadata: Metadata = { title: "How it works" };

export default function Page() {
  return (
    <PlannedPage
      eyebrow="Help"
      title="How it works"
      sub="A built-in explainer for the CRM."
      phase="Phase 5 · Manager and admin"
      parity={["Overview of data flow, capture and privacy", "Links to the AI and architecture explainers"]}
    />
  );
}
