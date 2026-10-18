import type { Metadata } from "next";

import { PlannedPage } from "@/components/ui/planned-page";

export const metadata: Metadata = { title: "Components" };

export default function Page() {
  return (
    <PlannedPage
      eyebrow="Dev"
      title="Components"
      sub="The design system in one place."
      phase="Phase 1 · Design system"
      parity={["Every primitive in every theme, light and dark"]}
    />
  );
}
