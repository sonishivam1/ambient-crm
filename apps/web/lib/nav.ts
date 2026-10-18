import {
  Bell,
  Building,
  Calendar,
  ChartColumn,
  CircleQuestionMark,
  ClipboardList,
  Eye,
  FileChartColumn,
  FileText,
  Gauge,
  House,
  Inbox,
  LayoutPanelTop,
  RefreshCw,
  Search,
  Shield,
  Sparkles,
  SquareCheck,
  Sun,
  Terminal,
  Users,
  type LucideIcon,
} from "lucide-react";

import type { RoleCapabilities } from "./auth/roles";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  tag?: string;
  /** Which sidebar counter, if any, to show on this item. */
  counter?: "overdueTasks" | "unreadNotifications";
  /** Paths that should also highlight this item. */
  match?: string[];
};
export type NavGroup = { label: string; items: NavItem[]; admin?: boolean };

const WORKSPACE: NavGroup = {
  label: "Workspace",
  items: [
    { href: "/", label: "Dashboard", icon: House },
    { href: "/call-cycle", label: "Call Cycle", icon: Calendar },
    { href: "/accounts", label: "Accounts", icon: Building, match: ["/accounts/"] },
    { href: "/contracts", label: "Contracts", icon: FileText },
    { href: "/contacts", label: "Contacts", icon: Users },
    { href: "/tasks", label: "Tasks", icon: SquareCheck, counter: "overdueTasks" },
  ],
};
const INSIGHTS: NavGroup = {
  label: "Insights",
  items: [
    { href: "/assistant", label: "Assistant", icon: Sparkles, tag: "AI" },
    { href: "/search", label: "Search", icon: Search },
  ],
};
const HELP: NavGroup = {
  label: "Help",
  items: [{ href: "/how-it-works", label: "How it works", icon: CircleQuestionMark, match: ["/how-it-works/"] }],
};
const MANAGER: NavGroup = {
  label: "Manager",
  items: [
    { href: "/team", label: "Team overview", icon: ChartColumn },
    { href: "/reports", label: "Reports", icon: FileChartColumn },
    { href: "/crm-usage", label: "CRM usage", icon: Gauge },
  ],
};

export function navFor(caps: RoleCapabilities): NavGroup[] {
  const groups = [WORKSPACE, INSIGHTS, HELP];
  if (caps.manager) groups.push(MANAGER);
  if (caps.admin) {
    const superOnly = (item: NavItem) => caps.superAdmin || !["/admin/view-as", "/admin/sync", "/dev/simulate-arrival"].includes(item.href);
    groups.push({
      label: "Admin · Dev",
      admin: true,
      items: (
        [
          { href: "/admin", label: "Admin home", icon: Shield },
          { href: "/admin/view-as", label: "View as", icon: Eye },
          { href: "/admin/sync", label: "Sync health", icon: RefreshCw },
          { href: "/admin/audit", label: "Audit log", icon: ClipboardList },
          { href: "/morning-brief", label: "Morning brief", icon: Sun },
          { href: "/review-queue", label: "Review queue", icon: Inbox },
          { href: "/notifications", label: "Notifications", icon: Bell, counter: "unreadNotifications" },
          { href: "/dev/simulate-arrival", label: "Simulate arrival", icon: Terminal },
          { href: "/dev/components", label: "Components", icon: LayoutPanelTop },
        ] satisfies NavItem[]
      ).filter(superOnly),
    });
  }
  return groups;
}

export function isActive(item: NavItem, pathname: string): boolean {
  if (item.href === "/") return pathname === "/";
  return pathname === item.href || (item.match ?? []).some((m) => pathname.startsWith(m));
}
