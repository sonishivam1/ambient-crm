import { describe, expect, it } from "vitest";

import { AppError, MASK, buildLogger, scrub, scrubString } from "./index";

/** A logger writing JSON lines into memory. */
function capture(level: "trace" | "info" | "warn" = "trace") {
  const lines: Record<string, unknown>[] = [];
  const log = buildLogger({ level, pretty: false, destination: { write: (s: string) => void lines.push(JSON.parse(s)) } });
  return { log, lines };
}

describe("scrub", () => {
  it("masks secrets and personal data at any depth", () => {
    const out = scrub({
      apiKey: "sk-live",
      config: { MONGODB_URI: "mongodb+srv://u:p@c.example.net", nested: { password: "x", Authorization: "Bearer abc", sessionToken: "t" } },
      contact: { email: "hannah@acme.example", phone: "0491 570 110", name: "Hannah" },
    });
    expect(out).toEqual({
      apiKey: MASK,
      config: { MONGODB_URI: MASK, nested: { password: MASK, Authorization: MASK, sessionToken: MASK } },
      contact: { email: MASK, phone: MASK, name: "Hannah" },
    });
  });

  it("removes free-text fields entirely", () => {
    expect(scrub({ feature: "account-summary", prompt: "…", reply: "…", facts: {}, notes: "…", keyPoints: "…", summary: "…" })).toEqual({ feature: "account-summary" });
  });

  it("masks connection strings, tokens, keys, emails and phones inside strings", () => {
    expect(scrubString("failed to reach mongodb+srv://admin:hunter2@cluster0.example.net/db?x=1 for hannah@acme.example")).toBe(
      "failed to reach [redacted-uri] for [email]",
    );
    expect(scrubString("Authorization: Bearer eyJhbGciOi.payload.sig")).toBe("Authorization: Bearer [redacted]");
    expect(scrubString("401 Incorrect API key provided: sk-proj-abc123XYZ789")).toBe("401 Incorrect API key provided: [redacted-key]");
    expect(scrubString("call +61 491 570 110 or 0491570110")).toBe("call [phone] or [phone]");
  });

  it("leaves dates, times, ids and small numbers alone", () => {
    const s = "2026-10-20T09:30:00Z northwind:CO-ACME-BT1 took 1250 ms, 2000000 tokens";
    expect(scrubString(s)).toBe(s);
  });

  it("copes with cycles and deep nesting", () => {
    const a: Record<string, unknown> = { name: "a" };
    a.self = a;
    expect(scrub(a)).toEqual({ name: "a", self: "[circular]" });
    let deep: Record<string, unknown> = { v: 1 };
    for (let i = 0; i < 12; i++) deep = { next: deep };
    expect(JSON.stringify(scrub(deep))).toContain("[truncated]");
  });
});

describe("logger", () => {
  it("writes structured lines with context, and redacts objects and messages", () => {
    const { log, lines } = capture();
    log.child({ area: "ai", tenantId: "northwind", userId: "u1", apiKey: "sk-should-mask" }).warn(
      { feature: "account-summary", errorKind: "provider", prompt: "secret prompt" },
      "call failed for hannah@acme.example",
    );
    const [line] = lines;
    expect(line).toMatchObject({ level: "warn", service: "ambient", area: "ai", tenantId: "northwind", userId: "u1", apiKey: MASK, feature: "account-summary", errorKind: "provider", msg: "call failed for [email]" });
    expect(line).not.toHaveProperty("prompt");
    expect(typeof line!.time).toBe("string");
  });

  it("redacts context on children of children too", () => {
    const { log, lines } = capture();
    log.child({ area: "seed" }).child({ connectionString: "mongodb://localhost:27017", tenantId: "t" }).info("ok");
    expect(lines[0]).toMatchObject({ area: "seed", connectionString: MASK, tenantId: "t" });
  });

  it("filters by level", () => {
    const { log, lines } = capture("warn");
    log.info("hidden");
    log.warn("shown");
    expect(lines.map((l) => l.msg)).toEqual(["shown"]);
  });

  it("logs our own errors in full and other errors by name and code only", () => {
    const { log, lines } = capture();
    log.error({ err: new AppError("budget_exhausted", "Budget used up for northwind") }, "ours");
    const provider = Object.assign(new Error("401 Incorrect API key provided: sk-proj-abc123XYZ789 for org-42"), { code: "invalid_api_key" });
    log.error({ err: provider }, "theirs");
    expect(lines[0]!.err).toMatchObject({ name: "AppError", code: "budget_exhausted", message: "Budget used up for northwind" });
    expect(lines[1]!.err).toEqual({ name: "Error", code: "invalid_api_key" });
    expect(JSON.stringify(lines)).not.toContain("sk-proj");
  });
});
