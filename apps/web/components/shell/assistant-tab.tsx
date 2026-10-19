"use client";

import { Sparkles } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

/** The side tab that opens Wren. Hidden on the full-page assistant. */
export function AssistantTab() {
  if (usePathname() === "/assistant") return null;
  return (
    <Link href="/assistant" className="assistant-tab" aria-label="Ask Wren">
      <Sparkles size={18} />
      <span style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}>WREN</span>
    </Link>
  );
}
