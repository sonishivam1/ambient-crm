import Link from "next/link";

import { PageHead } from "@/components/ui/primitives";

export default function GroupNotFound() {
  return (
    <>
      <PageHead eyebrow="Accounts" title="Customer group not found" />
      <div className="card pad max-w-[640px]">
        <p className="mt-0 mb-4 text-muted">This customer group doesn’t exist, or it isn’t in your book.</p>
        <Link className="btn primary" href="/accounts">
          Back to accounts
        </Link>
      </div>
    </>
  );
}
