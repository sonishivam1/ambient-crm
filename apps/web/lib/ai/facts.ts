/**
 * Facts: the only data a model ever sees. Fact sources (step 2) build them from
 * scoped read models; this module gives them a shape the engine can check.
 *
 * Every record carries a short `handle` (A1, T1, …) instead of its id. The
 * engine keeps the set of handles in this call, so a reply that cites anything
 * else can be caught. Pure: no database access.
 */

export type FactPacket = {
  /** What is sent to the model, as JSON. */
  data: Record<string, unknown>;
  /** Every handle that appears in `data`. */
  handles: ReadonlySet<string>;
};

const HANDLE = /^[A-Z][0-9]{1,4}$/;

/** Collect every `handle` field, at any depth. */
function collectHandles(value: unknown, into: Set<string>) {
  if (Array.isArray(value)) {
    for (const v of value) collectHandles(v, into);
  } else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      if (k === "handle" && typeof v === "string" && HANDLE.test(v)) into.add(v);
      else collectHandles(v, into);
    }
  }
}

export function factPacket(data: Record<string, unknown>): FactPacket {
  const handles = new Set<string>();
  collectHandles(data, handles);
  return { data, handles };
}

/** Hands out handles in order for one kind of record: A1, A2, … */
export function handleMaker(prefix: string) {
  let n = 0;
  return () => `${prefix}${++n}`;
}

/**
 * Wrap customer- or staff-written text so the model treats it as content.
 * Anything tag-like inside is removed first, so the text can't close the fence
 * or open a new one.
 */
export function untrusted(text: string): string {
  const clean = text.replace(/<\/?\s*[a-zA-Z][\w-]*[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  return `<untrusted>${clean}</untrusted>`;
}

/** The facts block as it goes into the prompt. */
export function renderFacts(packet: FactPacket): string {
  return `<facts>\n${JSON.stringify(packet.data, null, 2)}\n</facts>`;
}
