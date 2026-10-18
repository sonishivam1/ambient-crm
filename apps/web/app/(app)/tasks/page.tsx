import type { Metadata } from "next";

import { PlannedPage } from "@/components/ui/planned-page";

export const metadata: Metadata = { title: "Tasks" };

export default function Page() {
  return (
    <PlannedPage
      eyebrow="Workspace"
      title="Tasks"
      sub="Manual tasks, AI Smart Tasks and Next Actions in one list."
      phase="Phase 2 · Core CRM"
      parity={["Today, upcoming and all views with status, priority, source and assignee filters", "Create, edit, complete and assign tasks (managers)", "Accept or dismiss Cara suggestions and Next Actions"]}
    />
  );
}
