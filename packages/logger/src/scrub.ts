/**
 * Redaction for everything Ambient logs. It runs inside the logger, not at
 * call sites, so a careless log line still can't leak a secret or customer
 * data. Pure: no I/O.
 */

export const MASK = "[redacted]";

/** Keys whose values are secrets: the value is masked. */
const SECRET_KEY = /pass(word)?|secret|token|api[-_]?key|authori[sz]ation|cookie|session|credential|private[-_]?key|connection[-_]?string|^uri$|_uri$|dsn/i;

/** Keys whose values are personal data: the value is masked. */
const PERSONAL_KEY = /^(email|emails|phone|phones|mobile)$/i;

/** Keys that hold free text (prompts, replies, notes, bodies): the field is removed. */
const TEXT_KEY = /^(prompt|prompts|instructions|reply|replies|completion|facts|note|notes|summary|description|body|html|text|content|transcript|keyPoints|followUps|purpose)$/i;

const STRING_RULES: Array<[RegExp, string]> = [
  // Connection strings, with or without credentials.
  [/\b(?:mongodb(?:\+srv)?|postgres(?:ql)?|mysql|redis|amqps?):\/\/[^\s"'<>]+/gi, "[redacted-uri]"],
  // Bearer tokens and OpenAI-style keys.
  [/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]"],
  [/\bsk-[A-Za-z0-9_-]{8,}/g, "[redacted-key]"],
  // Email addresses.
  [/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]"],
  // Phone numbers: nine or more digits, optionally grouped with spaces (dates and times use - and :).
  [/(?:\+\d{1,3}\s?)?(?:\(\d{1,4}\)\s?)?(?:\d\s?){8,13}\d/g, "[phone]"],
];

/** Mask secrets, emails and phone numbers inside a string. */
export function scrubString(s: string): string {
  return STRING_RULES.reduce((out, [re, replacement]) => out.replace(re, replacement), s);
}

const MAX_DEPTH = 8;

/** A redacted copy of any value: secrets and personal data masked, free text removed, at any depth. */
export function scrub(value: unknown, depth = 0, seen = new WeakSet<object>()): unknown {
  if (typeof value === "string") return scrubString(value);
  if (value === null || typeof value !== "object") return value;
  if (value instanceof Date) return value;
  // Errors go to the logger's error serializer, which keeps only safe fields.
  if (value instanceof Error) return value;
  if (depth >= MAX_DEPTH) return "[truncated]";
  if (seen.has(value)) return "[circular]";
  seen.add(value);
  if (Array.isArray(value)) return value.map((v) => scrub(v, depth + 1, seen));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) {
    if (TEXT_KEY.test(k)) continue;
    out[k] = SECRET_KEY.test(k) || PERSONAL_KEY.test(k) ? MASK : scrub(v, depth + 1, seen);
  }
  return out;
}
