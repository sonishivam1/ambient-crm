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
 * A streaming route gives `stream: { events, run }` instead of `output` and
 * `handler`: `run` sends events, each checked against `events`, as
 * newline-delimited JSON. Routes live under app/api/v1/… (only app/api/health
 * is unversioned); a guard test enforces it.
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

type Common<I, A extends Auth> = {
  /** For logs, e.g. "me", "ai.chat". */
  name: string;
  /** 1 for /api/v1 routes; "unversioned" only for /api/health. */
  version: 1 | "unversioned";
  auth: A;
  /** Query parameters (GET, DELETE) or the JSON body (other methods). */
  input?: z.ZodType<I>;
  /** Set when a newer version replaces this route. */
  deprecation?: { sunset: Date; successor: string };
};

export type RouteDefinition<I, O, A extends Auth, E = never> = Common<I, A> &
  (
    | {
        /** The response; a handler result that doesn't match is a 500, so undeclared fields never leak. */
        output: z.ZodType<O>;
        handler: (context: RouteContext<I, A>) => Promise<O>;
        stream?: never;
      }
    | {
        output?: never;
        handler?: never;
        /** Each event is checked against `events`; one that doesn't match is replaced by an internal error. */
        stream: { events: z.ZodType<E>; run: (context: RouteContext<I, A>, send: (event: E) => void) => Promise<void> };
      }
  );

const INTERNAL = { code: "internal", message: "Something went wrong. Try again in a moment." };

export function defineRoute<I = undefined, O = unknown, A extends Auth = Auth, E = never>(def: RouteDefinition<I, O, A, E>) {
  return async function handle(request: Request): Promise<Response> {
    await connection();
    const started = performance.now();
    const requestId = requestIdFrom(request.headers.get(REQUEST_ID_HEADER));
    const url = new URL(request.url);
    let log = createLogger("api", { requestId });
    let status = 200;
    let code: string | undefined;
    let streaming = false;

    const headersFor = (contentType: string) => {
      const headers = new Headers({ "content-type": contentType, [REQUEST_ID_HEADER]: requestId });
      if (def.version !== "unversioned") headers.set("X-API-Version", String(def.version));
      if (def.deprecation) {
        headers.set("Deprecation", "true");
        headers.set("Sunset", def.deprecation.sunset.toUTCString());
        headers.set("Link", `<${def.deprecation.successor}>; rel="successor-version"`);
      }
      return headers;
    };
    const respond = (body: unknown, httpStatus: number) => {
      status = httpStatus;
      return new Response(JSON.stringify(body), { status: httpStatus, headers: headersFor("application/json; charset=utf-8") });
    };
    const logRequest = () =>
      log.info({ route: def.name, method: request.method, path: url.pathname, status, ...(code ? { code } : {}), ms: Math.round(performance.now() - started) }, "api request");

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
      const context = { input, scope: scope as RouteContext<I, A>["scope"], requestId, log, request };

      if (def.stream) {
        const { events, run } = def.stream;
        streaming = true;
        const encoder = new TextEncoder();
        const body = new ReadableStream<Uint8Array>({
          async start(controller) {
            const write = (value: unknown) => controller.enqueue(encoder.encode(`${JSON.stringify(value)}\n`));
            const send = (event: E) => {
              const checked = events.safeParse(event);
              if (checked.success) return write(checked.data);
              code = "invalid_output";
              log.error({ route: def.name, code }, "route sent an event that doesn't match its schema");
              write({ error: INTERNAL });
            };
            try {
              await run(context, send);
            } catch (err) {
              code = "internal";
              log.error({ err, route: def.name }, "route failed while streaming");
              write({ error: INTERNAL });
            } finally {
              controller.close();
              logRequest();
            }
          },
        });
        return new Response(body, { status: 200, headers: headersFor("application/x-ndjson; charset=utf-8") });
      }

      const result = await def.handler(context);
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
      // A stream logs when it ends.
      if (!streaming) logRequest();
    }
  };
}
