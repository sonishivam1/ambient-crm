"use client";

import { ChevronUp, Shield } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { DropdownMenu } from "radix-ui";
import { useEffect } from "react";

import { AmbientLogo } from "@/components/theme/brand-logo";
import type { RoleCapabilities } from "@/lib/auth/roles";
import { cn } from "@/lib/cn";
import { isActive, navFor, type NavGroup, type NavItem } from "@/lib/nav";

import { useShell } from "./shell-context";

type Counts = { overdueTasks: number; unreadNotifications: number };

/**
 * The fixed sidebar. It never scrolls on a normal screen: the admin tools sit
 * behind one "Admin" menu, spacing tightens on shorter screens, and the
 * footer card only shows when there's room.
 */
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
        {groups.map((g) =>
          g.admin ? (
            <AdminMenu key={g.label} group={g} pathname={pathname} counts={counts} />
          ) : (
            <div key={g.label} className="side-group">
              <div className="side-label">{g.label}</div>
              {g.items.map(item)}
            </div>
          ),
        )}
        <div className="side-foot">
          <div className="side-card">
            <b>Your book, on autopilot.</b>Customer email, meetings and AI in one workspace.
          </div>
        </div>
      </nav>
    </aside>
  );
}

/** Admin and development tools: one sidebar entry that opens a menu. */
function AdminMenu({ group, pathname, counts }: { group: NavGroup; pathname: string; counts: Counts }) {
  const active = group.items.some((it) => isActive(it, pathname));
  return (
    <div className="side-admin">
      <DropdownMenu.Root>
        <DropdownMenu.Trigger className={cn("nav-i w-full", active && "active")}>
          <Shield size={18} strokeWidth={1.9} />
          <span>{group.label}</span>
          <ChevronUp size={16} className="ml-auto opacity-70" />
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content className="pop side-pop" side="top" align="start" sideOffset={8} collisionPadding={12}>
            <div className="mh">{group.label}</div>
            {group.items.map((it) => {
              const count = it.counter ? counts[it.counter] : 0;
              return (
                <DropdownMenu.Item key={it.href} asChild>
                  <Link href={it.href} className={cn("mi", isActive(it, pathname) && "on")}>
                    <it.icon size={16} strokeWidth={1.9} />
                    {it.label}
                    {count > 0 && <span className="cnt">{count}</span>}
                  </Link>
                </DropdownMenu.Item>
              );
            })}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </div>
  );
}
