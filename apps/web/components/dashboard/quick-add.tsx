"use client";

import { Calendar, NotebookPen, Plus, SquareCheck, Users } from "lucide-react";
import Link from "next/link";
import { DropdownMenu } from "radix-ui";

const ITEMS = [
  { href: "/call-cycle?new=visit", label: "Add visit", icon: Calendar },
  { href: "/tasks?new=task", label: "New task", icon: SquareCheck },
  { href: "/contacts?new=contact", label: "Add contact", icon: Users },
  { href: "/accounts", label: "Log interaction", icon: NotebookPen },
];

export function QuickAddTile() {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger className="tile add">
        <div className="plus">
          <Plus size={22} />
        </div>
        <span className="mt-2 font-bold text-text2">Quick add</span>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className="pop" sideOffset={6} align="start">
          <div className="mh">Quick add</div>
          {ITEMS.map(({ href, label, icon: Icon }) => (
            <DropdownMenu.Item key={href} className="mi" asChild>
              <Link href={href}>
                <Icon size={16} />
                {label}
              </Link>
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
