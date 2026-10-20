import type { Metadata } from "next";
import { Suspense } from "react";

import { MorningBriefPanel } from "@/components/ai/morning-brief";
import { PageHead, Skeleton } from "@/components/ui/primitives";
import { morningBriefState } from "@/lib/ai/features/morning-brief";
import { getScope } from "@/lib/data/scope";
import { fmtLongDay } from "@/lib/format";

export const metadata: Metadata = { title: "Morning brief" };

export default function Page() {
  return (
    <Suspense fallback={<Skeleton className="h-[240px] rounded-[22px]" />}>
      <BriefContent />
    </Suspense>
  );
}

/** Starts from today's brief when one has been written; never calls the model on its own. */
async function BriefContent() {
  const scope = await getScope();
  const team = scope.user.capabilities.manager || scope.reps.all;
  return (
    <>
      <PageHead
        eyebrow="Wren"
        title="Morning brief"
        sub={`${fmtLongDay(new Date(), scope.timeZone)} · ${team ? "your team's tasks, visits and renewals, and your notifications" : "your tasks, visits, renewals and notifications"}`}
      />
      <div className="max-w-[860px]">
        <MorningBriefPanel initial={await morningBriefState()} timeZone={scope.timeZone} />
      </div>
    </>
  );
}
