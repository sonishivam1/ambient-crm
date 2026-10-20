import { createLogger } from "@ambient/logger";

import { REQUEST_ID_HEADER } from "@/lib/request-id";

/**
 * Logs every unhandled server error (pages, server actions, route handlers,
 * proxy) once, from instrumentation.ts. Codes and routes only: the error's
 * message is never logged, because it can echo request data, and the query
 * string is dropped from the path.
 */

type ErrorRequest = { path: string; method: string; headers: Record<string, string | string[] | undefined> };
type ErrorContext = { routerKind: string; routePath: string; routeType: string; renderSource?: string };

export function logRequestError(err: unknown, request: ErrorRequest, context: ErrorContext) {
  const header = request.headers[REQUEST_ID_HEADER];
  const requestId = Array.isArray(header) ? header[0] : header;
  const digest = (err as { digest?: unknown } | null)?.digest;
  createLogger("request", requestId ? { requestId } : {}).error(
    {
      err,
      method: request.method,
      path: request.path.split("?")[0],
      route: context.routePath,
      routeType: context.routeType,
      renderSource: context.renderSource,
      ...(typeof digest === "string" ? { digest } : {}),
    },
    "request failed",
  );
}
