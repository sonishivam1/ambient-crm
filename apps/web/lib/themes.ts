export const DARK_COOKIE = "amb_dark";

/**
 * Runs before first paint (inlined in <head>) so the saved colour mode applies
 * with no flash, while the page itself stays a static shell.
 */
export const THEME_BOOT_SCRIPT = `(()=>{try{const d=document.cookie.split("; ").includes("${DARK_COOKIE}=1");document.documentElement.dataset.dark=d?"1":"0";}catch(e){}})();`;

export function applyDark(dark: boolean) {
  document.documentElement.dataset.dark = dark ? "1" : "0";
  document.cookie = `${DARK_COOKIE}=${dark ? "1" : "0"}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
}
