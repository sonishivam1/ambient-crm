import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import { proxy } from "@/proxy";
import { REQUEST_ID_HEADER, requestIdFrom } from "@/lib/request-id";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe("request ids", () => {
  it("keeps a well-formed caller id and replaces anything else", () => {
    expect(requestIdFrom("abc-123_def.456")).toBe("abc-123_def.456");
    expect(requestIdFrom(null)).toMatch(UUID);
    expect(requestIdFrom("short")).toMatch(UUID);
    expect(requestIdFrom("has spaces and\nnewlines")).toMatch(UUID);
    expect(requestIdFrom("x".repeat(65))).toMatch(UUID);
  });

  it("are set by the proxy on the request and the response", () => {
    const res = proxy(new NextRequest("http://localhost/accounts"));
    const id = res.headers.get(REQUEST_ID_HEADER);
    expect(id).toMatch(UUID);
    // NextResponse.next({ request: { headers } }) forwards overridden request headers this way.
    expect(res.headers.get(`x-middleware-request-${REQUEST_ID_HEADER}`)).toBe(id);

    const kept = proxy(new NextRequest("http://localhost/accounts", { headers: { [REQUEST_ID_HEADER]: "caller-id-12345" } }));
    expect(kept.headers.get(REQUEST_ID_HEADER)).toBe("caller-id-12345");
  });
});
