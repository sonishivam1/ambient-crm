/**
 * Architecture guards: rules that must hold across the whole codebase, checked
 * by reading the source. They fail the moment a change breaks one.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const WEB = fileURLToPath(new URL("../../", import.meta.url));
const REPO = join(WEB, "..", "..");

function files(dir: string, keep: (path: string) => boolean): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next") continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...files(path, keep));
    else if (keep(path)) out.push(path);
  }
  return out;
}

const source = (path: string) => /\.(ts|tsx)$/.test(path) && !/\.test\.tsx?$/.test(path);
const rel = (path: string) => relative(REPO, path).split(sep).join("/");

describe("logging", () => {
  // db:inspect prints a report for a person to read; its errors use the logger.
  const ALLOWED = new Set(["packages/db/scripts/inspect.ts"]);

  it("never uses console in app or package code (use @ambient/logger)", () => {
    const dirs = [join(WEB, "app"), join(WEB, "lib"), join(WEB, "components"), join(REPO, "packages", "db", "src"), join(REPO, "packages", "db", "scripts"), join(REPO, "packages", "logger", "src")];
    const roots = [join(WEB, "proxy.ts"), join(WEB, "instrumentation.ts")];
    const offenders = [...dirs.flatMap((d) => files(d, source)), ...roots]
      .filter((p) => !ALLOWED.has(rel(p)))
      .filter((p) => /\bconsole\.(log|info|warn|error|debug|trace)\s*\(/.test(readFileSync(p, "utf8")))
      .map(rel);
    expect(offenders).toEqual([]);
  });
});

describe("HTTP API versioning (ADR 0007)", () => {
  const routes = files(join(WEB, "app"), (p) => /[\\/]route\.(ts|tsx)$/.test(p)).map((p) => ({ path: rel(p), text: readFileSync(p, "utf8") }));

  it("puts every route under /api/v1, except /api/health", () => {
    const misplaced = routes.map((r) => r.path).filter((p) => !p.startsWith("apps/web/app/api/v1/") && p !== "apps/web/app/api/health/route.ts");
    expect(misplaced).toEqual([]);
    expect(routes.length).toBeGreaterThanOrEqual(2);
  });

  it("builds every route with defineRoute, never a bare handler", () => {
    const bare = routes.filter((r) => !r.text.includes("defineRoute(") || /export\s+(async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/.test(r.text)).map((r) => r.path);
    expect(bare).toEqual([]);
  });
});

describe("server actions", () => {
  it("wraps every exported server action in loggedAction", () => {
    const actionFiles = files(join(WEB, "app"), source).filter((p) => /^\s*["']use server["']/.test(readFileSync(p, "utf8")));
    expect(actionFiles.length).toBeGreaterThan(0);
    const problems: string[] = [];
    for (const p of actionFiles) {
      const text = readFileSync(p, "utf8");
      if (/^export\s+(async\s+)?function\s/m.test(text)) problems.push(`${rel(p)}: exports a bare function`);
      for (const m of text.matchAll(/^export const (\w+)\s*=\s*(\w+)\(/gm)) {
        if (m[2] !== "loggedAction") problems.push(`${rel(p)}: ${m[1]} isn't wrapped in loggedAction`);
      }
    }
    expect(problems).toEqual([]);
  });
});
