import "server-only";

import { connection } from "next/server";
import type { z } from "zod";

import { AppError, createLogger, type Logger } from "@ambient/logger";

import { getScope, type Scope } from "@/lib/data/scope";
import { REQUEST_ID_HEADER, requestIdFrom } from "@/lib/request-id";

/**
 * The only way to write an HTTP route handler in Ambient (ADR 0007). Every
 * route gets the same versioning, validation, sign-in, error shape, request
 * id and logging:
 *
 *   // app/api/v1/me/route.ts
 *   export const GET = defineRoute({ name: "me", version: 1, auth: "user", output: MeResponse, handler: … });
 *
 * Routes live under app/api/v1/… (only app/api/health is unversioned); a guard
 * test enforces it.
 */

export type ApiStatus = 400 | 401 | 403 | 404 | 409 | 422 | 429;

/** An expected failure a handler raises on purpose; anything else is a 500. */
export class ApiError extends Error {
  constructor(
    readonly status: ApiStatus,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

type Auth = "user" | "none";

export type RouteContext<I, A extends Auth> = {
  input: I;
  /** The signed-in user's scope; null for routes without sign-in. */
  scope: A extends "user" ? Scope : null;
  requestId: string;
  /** Carries the request id, and the tenant and user when signed in. */
  log: Logger;
  request: Request;
};

export type RouteDefinition<I, O, A extends Auth> = {
  /** For logs, e.g. "me", "ai.chat". */
  name: string;
  /** 1 for /api/v1 routes; "unversioned" only for /api/health. */
  version: 1 | "unversioned";
  auth: A;
  /** Query parameters (GET, DELETE) or the JSON body (other methods). */
  input?: z.ZodType<I>;
  /** The response; a handler result that doesn't match is a 500, so undeclared fields never leak. */
  output: z.ZodType<O>;
  /** Set when a newer version replaces this route. */
  deprecation?: { sunset: Date; successor: string };
  handler: (context: RouteContext<I, A>) => Promise<O>;
};

const INTERNAL = { code: "internal", message: "Something went wrong. Try again in a moment." };

export function defineRoute<I = undefined, O = unknown, A extends Auth = Auth>(def: RouteDefinition<I, O, A>) {
  return async function handle(request: Request): Promise<Response> {
    await connection();
    const started = performance.now();
    const requestId = requestIdFrom(request.headers.get(REQUEST_ID_HEADER));
    const url = new URL(request.url);
    let log = createLogger("api", { requestId });
    let status = 200;
    let code: string | undefined;

    const respond = (body: unknown, httpStatus: number) => {
      status = httpStatus;
      const headers = new Headers({ "content-type": "application/json; charset=utf-8", [REQUEST_ID_HEADER]: requestId });
      if (def.version !== "unversioned") headers.set("X-API-Version", String(def.version));
      if (def.deprecation) {
        headers.set("Deprecation", "true");
        headers.set("Sunset", def.deprecation.sunset.toUTCString());
        headers.set("Link", `<${def.deprecation.successor}>; rel="successor-version"`);
      }
      return new Response(JSON.stringify(body), { status: httpStatus, headers });
    };

    try {
      let raw: unknown = {};
      if (["GET", "HEAD", "DELETE"].includes(request.method)) {
        raw = Object.fromEntries(url.searchParams);
      } else {
        const text = await request.text();
        if (text) {
          try {
            raw = JSON.parse(text);
          } catch {
            throw new ApiError(400, "invalid_json", "The request body isn't valid JSON.");
          }
        }
      }

      let input = undefined as I;
      if (def.input) {
        const parsed = def.input.safeParse(raw);
        if (!parsed.success) throw new ApiError(400, "invalid_input", parsed.error.issues[0]?.message ?? "The request isn't valid.");
        input = parsed.data;
      }

      let scope: Scope | null = null;
      if (def.auth === "user") {
        try {
          scope = await getScope();
        } catch (e) {
          if (e instanceof AppError && e.code === "unauthenticated") throw new ApiError(401, "unauthenticated", "Sign in to use this API.");
          throw e;
        }
        log = log.child({ tenantId: scope.tenantId, userId: scope.user._id });
      }

      const result = await def.handler({ input, scope: scope as RouteContext<I, A>["scope"], requestId, log, request });
      const out = def.output.safeParse(result);
      if (!out.success) {
        code = "invalid_output";
        log.error({ route: def.name, code }, "route returned a response that doesn't match its schema");
        return respond({ error: INTERNAL }, 500);
      }
      return respond(out.data, 200);
    } catch (err) {
      if (err instanceof ApiError) {
        code = err.code;
        return respond({ error: { code: err.code, message: err.message } }, err.status);
      }
      code = "internal";
      log.error({ err, route: def.name }, "route failed");
      return respond({ error: INTERNAL }, 500);
    } finally {
      log.info({ route: def.name, method: request.method, path: url.pathname, status, ...(code ? { code } : {}), ms: Math.round(performance.now() - started) }, "api request");
    }
  };
}
