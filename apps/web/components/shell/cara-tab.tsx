"use client";

import { Sparkles } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

/** The side tab that opens Cara. Hidden on the full-page assistant. */
export function CaraTab() {
  if (usePathname() === "/assistant") return null;
  return (
    <Link href="/assistant" className="cara-tab" aria-label="Ask Cara">
      <Sparkles size={18} />
      <span style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}>CARA</span>
    </Link>
  );
}
