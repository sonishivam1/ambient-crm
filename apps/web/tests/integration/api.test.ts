import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";

import { GET as health } from "@/app/api/health/route";
import { GET as me } from "@/app/api/v1/me/route";
import { ApiError, defineRoute } from "@/lib/api/route";

import { USERS, signInAs } from "../support/session";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const get = (path: string, headers: Record<string, string> = {}) => new Request(`http://localhost${path}`, { headers });
const post = (path: string, body: string) => new Request(`http://localhost${path}`, { method: "POST", body, headers: { "content-type": "application/json" } });

afterEach(() => {
  process.env.AMBIENT_DEV_AUTH = "1";
});

describe("GET /api/health", () => {
  it("answers ok, unversioned, with no data", async () => {
    const res = await health(get("/api/health"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
    expect(res.headers.get("X-API-Version")).toBeNull();
    expect(res.headers.get("x-request-id")).toMatch(UUID);
  });
});

describe("GET /api/v1/me", () => {
  it("returns the signed-in user and their tenant, versioned, echoing the request id", async () => {
    signInAs(USERS.northwind.rep);
    const res = await me(get("/api/v1/me", { "x-request-id": "test-request-0001" }));
    expect(res.status).toBe(200);
    expect(res.headers.get("X-API-Version")).toBe("1");
    expect(res.headers.get("x-request-id")).toBe("test-request-0001");
    expect(await res.json()).toEqual({
      user: { name: "Priya Nair", email: "priya.nair@northwind.example", role: "user", roleLabel: "CRM-USER" },
      tenant: { name: "Northwind Supply Co.", timeZone: "Australia/Sydney" },
    });
  });

  it("answers for the caller's own tenant", async () => {
    signInAs(USERS.harbor.rep);
    const body = await (await me(get("/api/v1/me"))).json();
    expect(body.tenant).toEqual({ name: "Harbor & Finch Distribution", timeZone: "Pacific/Auckland" });
  });

  it("is 401 with the error shape when nobody can be signed in", async () => {
    process.env.AMBIENT_DEV_AUTH = "0";
    const res = await me(get("/api/v1/me"));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: { code: "unauthenticated", message: "Sign in to use this API." } });
  });

  it("replaces a malformed request id instead of echoing it", async () => {
    signInAs(USERS.northwind.rep);
    const res = await me(get("/api/v1/me", { "x-request-id": "bad id; injected=yes" }));
    expect(res.headers.get("x-request-id")).toMatch(UUID);
  });
});

describe("defineRoute", () => {
  const echo = defineRoute({
    name: "test.echo",
    version: 1,
    auth: "user",
    input: z.object({ count: z.number().int().min(1, "Count must be at least 1.") }),
    output: z.object({ count: z.number() }),
    handler: async ({ input }) => {
      if (input.count === 404) throw new ApiError(404, "not_found", "No such thing.");
      if (input.count === 500) throw new Error("secret internal detail for hannah@acme.example");
      if (input.count === 7) return { count: 7, leaked: "an undeclared field" };
      if (input.count === 13) return { count: "thirteen" } as unknown as { count: number };
      return { count: input.count };
    },
  });

  it("returns only the declared output", async () => {
    signInAs(USERS.northwind.rep);
    expect(await (await echo(post("/api/v1/test", '{"count":3}'))).json()).toEqual({ count: 3 });
    // Undeclared fields are stripped by the output schema.
    expect(await (await echo(post("/api/v1/test", '{"count":7}'))).json()).toEqual({ count: 7 });
  });

  it("rejects bad JSON and bad input with 400 and a reason", async () => {
    signInAs(USERS.northwind.rep);
    const badJson = await echo(post("/api/v1/test", "{not json"));
    expect(badJson.status).toBe(400);
    expect((await badJson.json()).error.code).toBe("invalid_json");
    const badInput = await echo(post("/api/v1/test", '{"count":0}'));
    expect(badInput.status).toBe(400);
    expect(await badInput.json()).toEqual({ error: { code: "invalid_input", message: "Count must be at least 1." } });
  });

  it("maps ApiError to its status, and hides anything unexpected behind a generic 500", async () => {
    signInAs(USERS.northwind.rep);
    const notFound = await echo(post("/api/v1/test", '{"count":404}'));
    expect(notFound.status).toBe(404);
    expect(await notFound.json()).toEqual({ error: { code: "not_found", message: "No such thing." } });

    const crash = await echo(post("/api/v1/test", '{"count":500}'));
    expect(crash.status).toBe(500);
    const text = await crash.text();
    expect(JSON.parse(text)).toEqual({ error: { code: "internal", message: "Something went wrong. Try again in a moment." } });
    expect(text).not.toContain("secret");

    const wrongShape = await echo(post("/api/v1/test", '{"count":13}'));
    expect(wrongShape.status).toBe(500);
  });

  it("marks a deprecated route with Deprecation, Sunset and successor headers", async () => {
    const old = defineRoute({
      name: "test.old",
      version: 1,
      auth: "none",
      output: z.object({ ok: z.boolean() }),
      deprecation: { sunset: new Date("2027-06-30T00:00:00Z"), successor: "/api/v2/test" },
      handler: async () => ({ ok: true }),
    });
    const res = await old(get("/api/v1/test-old"));
    expect(res.headers.get("Deprecation")).toBe("true");
    expect(res.headers.get("Sunset")).toBe("Wed, 30 Jun 2027 00:00:00 GMT");
    expect(res.headers.get("Link")).toBe('</api/v2/test>; rel="successor-version"');
  });
});
