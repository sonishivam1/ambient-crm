/**
 * Checks a model's reply against the facts it was given. Pure: no I/O.
 *
 * Every object in a reply that has a `sources` array is a claim. A claim keeps
 * only the handles that were in this call's facts; a claim left with none is
 * removed (from an array) or set to null (as a single field). Nothing the
 * model invents survives.
 */

export type VerifyResult<T> = {
  output: T;
  /** Claims found, and how many were removed for citing nothing real. */
  claims: number;
  removed: number;
};

function isClaim(value: unknown): value is { sources: unknown[] } {
  return !!value && typeof value === "object" && !Array.isArray(value) && Array.isArray((value as { sources?: unknown }).sources);
}

export function verifySources<T>(output: T, handles: ReadonlySet<string>): VerifyResult<T> {
  let claims = 0;
  let removed = 0;

  /** Returns the cleaned value, or `undefined` when a claim should go. */
  function walk(value: unknown): unknown {
    if (Array.isArray(value)) {
      return value.map(walk).filter((v) => v !== undefined);
    }
    if (value && typeof value === "object") {
      const entries = Object.entries(value).map(([k, v]) => {
        if (k === "sources" && Array.isArray(v)) return [k, [...new Set(v.filter((h): h is string => typeof h === "string" && handles.has(h)))]];
        const cleaned = walk(v);
        // A single claim field (e.g. nextStep) that lost its sources becomes null.
        return [k, cleaned === undefined && isClaim(v) ? null : cleaned];
      });
      const next = Object.fromEntries(entries);
      if (isClaim(value)) {
        claims += 1;
        if ((next.sources as string[]).length === 0) {
          removed += 1;
          return undefined;
        }
      }
      return next;
    }
    return value;
  }

  const cleaned = walk(output);
  return { output: (cleaned === undefined ? null : cleaned) as T, claims, removed };
}
