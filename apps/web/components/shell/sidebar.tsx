"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";

import { AmbientLogo } from "@/components/theme/brand-logo";
import type { RoleCapabilities } from "@/lib/auth/roles";
import { cn } from "@/lib/cn";
import { isActive, navFor, type NavItem } from "@/lib/nav";

import { useShell } from "./shell-context";

type Counts = { overdueTasks: number; unreadNotifications: number };

export function Sidebar({ capabilities, counts }: { capabilities: RoleCapabilities; counts: Counts }) {
  const pathname = usePathname();
  const { navOpen, setNavOpen } = useShell();
  const groups = navFor(capabilities);

  // Close the mobile drawer after navigating.
  useEffect(() => setNavOpen(false), [pathname, setNavOpen]);

  const item = (it: NavItem) => {
    const count = it.counter ? counts[it.counter] : 0;
    return (
      <Link key={it.href} href={it.href} className={cn("nav-i", isActive(it, pathname) && "active")}>
        <it.icon size={18} strokeWidth={1.9} />
        <span>{it.label}</span>
        {it.tag && <span className="tag">{it.tag}</span>}
        {count > 0 && <span className="cnt">{count}</span>}
      </Link>
    );
  };

  return (
    <aside
      className={cn("sidebar", navOpen && "open")}
      onClick={(e) => {
        if (navOpen && e.target === e.currentTarget) setNavOpen(false);
      }}
    >
      <nav className="side-body" aria-label="Main">
        <Link href="/" className="side-logo" aria-label="Ambient · Dashboard">
          <AmbientLogo />
        </Link>
        {groups.map((g) => (
          <div key={g.label} className={g.admin ? "side-admin" : "side-group"}>
            <div className="side-label">{g.label}</div>
            {g.items.map(item)}
          </div>
        ))}
        <div className="side-foot">
          <div className="side-card">
            <b>Your book, on autopilot.</b>Customer email, meetings and AI in one workspace.
          </div>
        </div>
      </nav>
      <svg className="side-wave" viewBox="0 0 100 1000" preserveAspectRatio="none" aria-hidden>
        <path d="M0,0 L34,0 C88,120 92,240 50,380 C8,520 6,640 46,760 C74,850 78,930 40,1000 L0,1000 Z" />
      </svg>
    </aside>
  );
}
