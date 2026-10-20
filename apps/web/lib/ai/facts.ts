import { createHash } from "node:crypto";

import { HANDLE_PREFIX, type AiCardData, type AiCardKind } from "./cards";

/**
 * Facts: the only data a model ever sees. Fact sources (lib/ai/facts/) build
 * them from scoped read models with factsBuilder(); this module gives them a
 * shape the engine can check.
 *
 * Every record carries a short `handle` (A1, T1, …) instead of its id. The
 * engine keeps the set of handles in this call, so a reply that cites anything
 * else can be caught, and the card for each handle, so a verified answer shows
 * the real records. Pure: no database access.
 */

export type FactPacket = {
  /** What is sent to the model, as JSON. */
  data: Record<string, unknown>;
  /** Every handle that appears in `data`. */
  handles: ReadonlySet<string>;
  /** The card for each handle. Server-side only: never sent to the model. */
  cards: ReadonlyMap<string, AiCardData>;
  /** A hash of `data`: the same facts give the same fingerprint (step 3's cache key). */
  fingerprint: string;
};

const HANDLE = /^[A-Z][0-9]{1,4}$/;

/** Staff- and customer-written text is cut to this many characters. */
export const UNTRUSTED_LIMIT = 300;

/**
 * The only fields a fact of each kind may carry. Anything else a fact source
 * passes is dropped, so an email, phone or id can't slip into a prompt.
 */
export const ALLOWED_FIELDS: Record<AiCardKind, readonly string[]> = {
  account: ["name", "type", "segment", "division", "health", "owner", "fyRevenue", "lastTouch", "group"],
  task: ["title", "account", "owner", "status", "due", "overdue", "priority"],
  visit: ["when", "type", "account", "rep", "purpose", "status", "sentiment", "ratings", "keyPoints", "followUps"],
  contract: ["name", "account", "value", "end", "daysLeft", "band"],
  contact: ["name", "title", "roles"],
  interaction: ["type", "date", "by", "summary"],
  notification: ["title", "body", "when", "account"],
};

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

export function factPacket(data: Record<string, unknown>, cards: ReadonlyMap<string, AiCardData> = new Map()): FactPacket {
  const handles = new Set<string>();
  collectHandles(data, handles);
  // Only records that made it into the facts can become cards.
  const kept = new Map([...cards].filter(([h]) => handles.has(h)));
  const fingerprint = createHash("sha256").update(JSON.stringify(data)).digest("hex");
  return { data, handles, cards: kept, fingerprint };
}

/** Hands out handles in order for one kind of record: A1, A2, … */
export function handleMaker(prefix: string) {
  let n = 0;
  return () => `${prefix}${++n}`;
}

/** Keep only the allowed fields for this kind, and drop empty ones. */
export function allowedFields(kind: AiCardKind, fact: Record<string, unknown>): Record<string, unknown> {
  const allowed = ALLOWED_FIELDS[kind];
  return Object.fromEntries(Object.entries(fact).filter(([k, v]) => allowed.includes(k) && v !== undefined));
}

type CardInput<K extends AiCardKind> = Omit<Extract<AiCardData, { kind: K }>, "kind" | "handle">;

/**
 * Builds one fact packet. `add()` gives a record its handle, keeps its card
 * and returns the fact (handle first, allowed fields only) to place in the data.
 */
export function factsBuilder() {
  const counters = new Map<AiCardKind, number>();
  const cards = new Map<string, AiCardData>();
  return {
    add<K extends AiCardKind>(kind: K, fact: Record<string, unknown>, card: CardInput<K>): { handle: string } & Record<string, unknown> {
      const n = (counters.get(kind) ?? 0) + 1;
      counters.set(kind, n);
      const handle = `${HANDLE_PREFIX[kind]}${n}`;
      // `card` is exactly this kind's card without kind and handle, so the result is one AiCardData.
      cards.set(handle, { ...card, kind, handle } as unknown as AiCardData);
      return { handle, ...allowedFields(kind, fact) };
    },
    build(data: Record<string, unknown>): FactPacket {
      return factPacket(data, cards);
    },
  };
}

/** Cut text to `max` characters, at a word break where there is one nearby. */
export function cut(text: string, max: number): string {
  if (text.length <= max) return text;
  const head = text.slice(0, max - 1);
  const space = head.lastIndexOf(" ");
  const nearby = space > 0 && space > max - 40;
  return `${(nearby ? head.slice(0, space) : head).trimEnd()}…`;
}

/**
 * Wrap customer- or staff-written text so the model treats it as content.
 * Anything tag-like inside is removed first, so the text can't close the fence
 * or open a new one; then it is cut to `max` characters.
 */
export function untrusted(text: string, max = UNTRUSTED_LIMIT): string {
  const clean = text.replace(/<\/?\s*[a-zA-Z][\w-]*[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  return `<untrusted>${cut(clean, max)}</untrusted>`;
}

/** Fence text that may be empty; empty text is left out of the facts. */
export const untrustedIfAny = (text: string | null | undefined) => (text?.trim() ? untrusted(text) : undefined);

/** The facts block as it goes into the prompt. */
export function renderFacts(packet: FactPacket): string {
  return `<facts>\n${JSON.stringify(packet.data, null, 2)}\n</facts>`;
}
