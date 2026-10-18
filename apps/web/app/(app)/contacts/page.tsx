import type { Metadata } from "next";

import { PlannedPage } from "@/components/ui/planned-page";

export const metadata: Metadata = { title: "Contacts" };

export default function Page() {
  return (
    <PlannedPage
      eyebrow="Workspace"
      title="Contacts"
      sub="The CRM is the system of record for customer contacts."
      phase="Phase 2 · Core CRM"
      parity={["Search and filter contacts by role, account and status", "Create and edit contacts, synced up to Snowflake", "Prompt for email backfill on creation and email change"]}
    />
  );
}
