import { beforeEach, describe, expect, it, vi } from "vitest";

import { getCurrentUser } from "@/lib/auth/session";
import { loggedAction } from "@/lib/log";
import { logRequestError } from "@/lib/request-error";
import { markAllNotificationsRead } from "@/app/actions/notifications";
import { completeTask, createTask } from "@/app/actions/tasks";

import { clearLog, entries } from "../support/log-recorder";
import { USERS, signInAs } from "../support/session";

vi.mock("@ambient/logger", async (importOriginal) => {
  const real = await importOriginal<typeof import("@ambient/logger")>();
  const { createRecordingLogger } = await import("../support/log-recorder");
  return { ...real, createLogger: createRecordingLogger };
});

const actionEntries = () => entries.filter((e) => e.area === "action");

beforeEach(clearLog);

describe("server actions are logged", () => {
  it("logs name, outcome and duration with the tenant and user", async () => {
    signInAs(USERS.northwind.rep);
    await markAllNotificationsRead();
    const [entry] = actionEntries();
    expect(entry).toMatchObject({
      level: "info",
      context: { tenantId: "northwind", userId: USERS.northwind.rep },
      fields: { action: "notifications.markAllRead", outcome: "ok" },
    });
    expect(typeof entry!.fields.ms).toBe("number");
  });

  it("logs an expected refusal as rejected, with its reason", async () => {
    signInAs(USERS.northwind.rep);
    const result = await createTask({ accountId: "", title: "No account" });
    expect(result.ok).toBe(false);
    expect(actionEntries().at(-1)).toMatchObject({ level: "info", fields: { action: "tasks.create", outcome: "rejected", reason: "Choose an account." } });
  });

  it("logs a thrown error and rethrows it unchanged", async () => {
    signInAs(USERS.northwind.rep);
    await expect(completeTask("northwind:no-such-task")).rejects.toThrow("Task not found.");
    expect(actionEntries().at(-1)).toMatchObject({ level: "error", fields: { action: "tasks.complete", outcome: "error" } });
    expect(actionEntries().at(-1)!.fields.err).toBeInstanceOf(Error);
  });

  it("doesn't treat Next.js redirects as failures", async () => {
    const redirecting = loggedAction("test.redirect", async () => {
      throw Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT;replace;/tasks;307;" });
    });
    await expect(redirecting()).rejects.toThrow("NEXT_REDIRECT");
    expect(entries.filter((e) => e.level === "error")).toEqual([]);
  });
});

describe("unhandled server errors", () => {
  it("are logged once with route, type and request id, without the query string", () => {
    logRequestError(
      new Error("boom for hannah@acme.example"),
      { path: "/accounts?q=hannah@acme.example", method: "GET", headers: { "x-request-id": "req-0123456789" } },
      { routerKind: "App Router", routePath: "/accounts", routeType: "render", renderSource: "server-rendering" },
    );
    expect(entries).toHaveLength(1);
    const [entry] = entries;
    expect(entry).toMatchObject({
      level: "error",
      area: "request",
      context: { requestId: "req-0123456789" },
      fields: { method: "GET", path: "/accounts", route: "/accounts", routeType: "render" },
    });
    // The error object goes to the logger's serializer, which keeps only name and code.
    expect(entry!.fields.err).toBeInstanceOf(Error);
    expect(JSON.stringify({ ...entry!.fields, err: undefined })).not.toContain("hannah");
  });
});

describe("sign-in", () => {
  it("warns when a development user doesn't exist and the default is used", async () => {
    signInAs("northwind:u-nobody");
    const user = await getCurrentUser();
    expect(user._id).toBe(USERS.northwind.super);
    expect(entries.find((e) => e.area === "auth")).toMatchObject({ level: "warn", fields: { requestedUserId: "northwind:u-nobody" } });
  });
});
