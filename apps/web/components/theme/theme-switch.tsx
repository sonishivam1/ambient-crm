"use client";

import { MoonStar, Sun } from "lucide-react";

import { cn } from "@/lib/cn";

import { useColorMode } from "./use-theme";

/** One switch for light and dark mode: the knob slides, the icon shows the current mode. */
export function ThemeSwitch({ className }: { className?: string }) {
  const { dark, setDark } = useColorMode();
  const label = dark ? "Switch to light mode" : "Switch to dark mode";
  return (
    <button
      type="button"
      role="switch"
      aria-checked={dark}
      aria-label="Dark mode"
      title={label}
      className={cn("theme-switch", className)}
      onClick={() => setDark(!dark)}
    >
      <span className="ts-icon ts-sun" aria-hidden>
        <Sun size={17} strokeWidth={2.2} />
      </span>
      <span className="ts-icon ts-moon" aria-hidden>
        <MoonStar size={17} strokeWidth={2.2} />
      </span>
      <span className="ts-knob" aria-hidden />
    </button>
  );
}
