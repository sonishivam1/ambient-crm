import type { Metadata } from "next";

import { PlannedPage } from "@/components/ui/planned-page";

export const metadata: Metadata = { title: "How the AI works" };

export default function Page() {
  return (
    <PlannedPage
      eyebrow="Help"
      title="How the AI works"
      sub="What the model sees, and what it never sees."
      phase="Phase 5 · Manager and admin"
      parity={["Explain each AI feature, its trigger and its inputs", "Explain PII redaction and the participant fence"]}
    />
  );
}
