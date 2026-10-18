import type { Metadata } from "next";

import { PlannedPage } from "@/components/ui/planned-page";

export const metadata: Metadata = { title: "Search" };

export default function Page() {
  return (
    <PlannedPage
      eyebrow="Insights"
      title="Search"
      sub="Quick search plus semantic search over email analyses."
      phase="Phase 4 · AI layer"
      parity={["Quick search across accounts and contacts", "Semantic search over email and meeting analyses (vector search)", "Participant-scoped results only"]}
    />
  );
}
