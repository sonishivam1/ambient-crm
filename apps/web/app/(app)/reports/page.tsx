import type { Metadata } from "next";

import { PlannedPage } from "@/components/ui/planned-page";

export const metadata: Metadata = { title: "Reports" };

export default function Page() {
  return (
    <PlannedPage
      eyebrow="Manager"
      title="Reports"
      sub="Power BI reports, one click away."
      phase="Phase 5 · Manager and admin"
      parity={["Report library with deep links into Power BI"]}
    />
  );
}
