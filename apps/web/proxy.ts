import { NextResponse, type NextRequest } from "next/server";

import { REQUEST_ID_HEADER, requestIdFrom } from "@/lib/request-id";

/**
 * Runs before every request (pages, server actions, route handlers): gives it
 * a request id, on the request for our server code and logs, and on the
 * response for the caller. Authorisation never lives here; every page, action
 * and route checks scope itself.
 */
export function proxy(request: NextRequest) {
  const id = requestIdFrom(request.headers.get(REQUEST_ID_HEADER));
  const headers = new Headers(request.headers);
  headers.set(REQUEST_ID_HEADER, id);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set(REQUEST_ID_HEADER, id);
  return response;
}

export const config = {
  // Everything except static assets.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
