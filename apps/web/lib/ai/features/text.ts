import { cut } from "../facts";

/**
 * Plain text for anything a model wrote: no markup or markdown, no handles
 * printed in brackets (they belong in sources), cut to `max` characters.
 * Pure: no I/O.
 */
export function plainText(text: string, max: number): string {
  const plain = text
    .replace(/<[^>]*>/g, " ")
    // Only handle prefixes (A1, T3, …), so "(Q4)" in a title survives.
    .replace(/\s*[([]\s*[ATVKCIN]\d{1,4}(\s*,\s*[ATVKCIN]\d{1,4})*\s*[)\]]/g, "")
    .replace(/[*_`#]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return cut(plain, max);
}
