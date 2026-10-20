"use client";

import { Bell, ChevronDown, LogOut, Menu, Moon, Search, Settings, Sun, Check } from "lucide-react";
import Link from "next/link";
import { DropdownMenu } from "radix-ui";
import { useTransition } from "react";
import { toast } from "sonner";

import { setLens, switchDevUser } from "@/app/actions/session";
import { ThemeSwitch } from "@/components/theme/theme-switch";
import { useColorMode } from "@/components/theme/use-theme";
import { Avatar } from "@/components/ui/primitives";
import type { RoleCapabilities } from "@/lib/auth/roles";
import { cn } from "@/lib/cn";
import { ALL_LENS, type LensOption } from "@/lib/lens";

import { useShell } from "./shell-context";

type Me = { name: string; email: string; roleLabel: string; tenant: string };
export type DevUser = { id: string; name: string; roleLabel: string; tenant: string };

export function Topbar({
  me,
  capabilities,
  lens,
  lenses,
  unread,
  devUsers,
  currentUserId,
}: {
  me: Me;
  capabilities: RoleCapabilities;
  lens: string;
  /** The tenant's lenses, "All" first; empty when the tenant has none. */
  lenses: LensOption[];
  unread: number;
  devUsers: DevUser[] | null;
  currentUserId: string;
}) {
  const { setNavOpen, navOpen, setPaletteOpen } = useShell();
  const { dark, setDark } = useColorMode();
  const [pending, startTransition] = useTransition();

  return (
    <header className="topbar">
      <button className="icon-btn tb-menu" aria-label="Menu" onClick={() => setNavOpen(!navOpen)}>
        <Menu size={18} />
      </button>
      <button className="search-pill" onClick={() => setPaletteOpen(true)}>
        <Search size={16} />
        <span className="ph">Search accounts, contacts, emails…</span>
        <span className="kbd">Ctrl K</span>
      </button>

      {capabilities.lens && lenses.length > 0 && (
        <div className="seg lens" role="radiogroup" aria-label="Division lens">
          {lenses.map((l) => (
            <button
              key={l.key}
              role="radio"
              aria-checked={lens === l.key}
              className={cn(lens === l.key && "on")}
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  await setLens(l.key);
                  toast(`Division lens: ${l.key === ALL_LENS ? "All divisions" : l.label}`);
                })
              }
            >
              {l.label}
            </button>
          ))}
        </div>
      )}

      <ThemeSwitch className="tb-hide" />

      <Link href="/notifications" className="icon-btn" aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}>
        <Bell size={18} />
        {unread > 0 && <span className="dot">{unread}</span>}
      </Link>

      {devUsers && (
        <DropdownMenu.Root>
          <DropdownMenu.Trigger className="icon-btn tb-hide" aria-label="Development: switch role" title="Development · switch role">
            <Settings size={18} />
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content className="pop" align="end" sideOffset={6}>
              <div className="mh">Development · view as role</div>
              {devUsers.map((u) => (
                <DropdownMenu.Item
                  key={u.id}
                  className="mi"
                  onSelect={() =>
                    startTransition(async () => {
                      await switchDevUser(u.id);
                      toast(`Now viewing as ${u.name} · ${u.roleLabel}`);
                    })
                  }
                >
                  <Avatar name={u.name} size="sm" />
                  <span>
                    <b>{u.name}</b>
                    <br />
                    <span className="text-muted" style={{ fontSize: 11.5 }}>
                      {u.roleLabel} · {u.tenant}
                    </span>
                  </span>
                  {u.id === currentUserId && <Check size={16} className="ck" />}
                </DropdownMenu.Item>
              ))}
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      )}

      <DropdownMenu.Root>
        <DropdownMenu.Trigger className="user-chip">
          <Avatar name={me.name} />
          <div className="nm-wrap">
            <div className="nm">{me.name}</div>
            <span className="role-badge">{me.roleLabel}</span>
          </div>
          <ChevronDown size={16} />
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content className="pop" align="end" sideOffset={6} style={{ minWidth: 260 }}>
            <div className="mb-1.5 border-b border-line px-3.5 py-3">
              <b>{me.name}</b>
              <div className="text-muted" style={{ fontSize: 12.5 }}>
                {me.email}
              </div>
              <div className="text-muted" style={{ fontSize: 12.5 }}>
                {me.tenant}
              </div>
              <div className="mt-1.5">
                <span className="role-badge">{me.roleLabel}</span>
              </div>
            </div>
            <DropdownMenu.Item className="mi" onSelect={() => setDark(!dark)}>
              {dark ? <Sun size={16} /> : <Moon size={16} />}
              {dark ? "Switch to light mode" : "Switch to dark mode"}
            </DropdownMenu.Item>
            <DropdownMenu.Item className="mi" asChild>
              <Link href="/notifications">
                <Bell size={16} />
                Notification history
              </Link>
            </DropdownMenu.Item>
            <DropdownMenu.Separator className="pop-sep" />
            <DropdownMenu.Item className="mi" onSelect={() => toast("Sign-out arrives with real sign-in.")}>
              <LogOut size={16} />
              Sign out
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </header>
  );
}
