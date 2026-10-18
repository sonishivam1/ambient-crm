"use client";

import { useSyncExternalStore } from "react";

import { applyDark } from "@/lib/themes";

function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-dark"] });
  return () => observer.disconnect();
}

/** The live light/dark mode, read from <html> so it stays in step with the boot script. */
export function useColorMode() {
  const dark = useSyncExternalStore(
    subscribe,
    () => document.documentElement.dataset.dark === "1",
    () => false,
  );
  return { dark, setDark: applyDark };
}
