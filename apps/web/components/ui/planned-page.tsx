import { Construction } from "lucide-react";
import Link from "next/link";

import { PageHead } from "./primitives";

/**
 * Placeholder for a route that is mapped but not yet built. Keeps every
 * sidebar link working while features land one at a time.
 */
export function PlannedPage({
  eyebrow,
  title,
  sub,
  phase,
  parity,
}: {
  eyebrow: string;
  title: string;
  sub: string;
  phase: string;
  /** What this page will do once built. */
  parity: string[];
}) {
  return (
    <>
      <PageHead eyebrow={eyebrow} title={title} sub={sub} />
      <div className="card pad flex max-w-[760px] items-start gap-[18px]">
        <span className="grid size-[52px] flex-none place-items-center rounded-2xl bg-accent-soft text-accent">
          <Construction size={24} />
        </span>
        <div>
          <b style={{ fontSize: 17 }}>Coming soon · {phase}</b>
          <p className="mt-1.5 mb-3 text-muted">When it’s built, this page will:</p>
          <ul className="mb-4 ml-5 list-disc space-y-1 text-text2">
            {parity.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
          <Link className="btn primary" href="/">
            Back to dashboard
          </Link>
        </div>
      </div>
    </>
  );
}
