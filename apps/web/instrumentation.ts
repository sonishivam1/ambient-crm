import type { Instrumentation } from "next";

/**
 * Next.js calls onRequestError for every unhandled server error: pages,
 * server actions, route handlers and the proxy. One place logs them all.
 */
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  // The logger is Node-only; nothing in Ambient runs on the Edge runtime.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { logRequestError } = await import("@/lib/request-error");
  logRequestError(err, request, context);
};
