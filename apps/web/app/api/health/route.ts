import { defineRoute } from "@/lib/api/route";

import { HealthResponse } from "./schema";

/** The one unversioned route (ADR 0007): hosting platforms expect a fixed path. */
export const GET = defineRoute({
  name: "health",
  version: "unversioned",
  auth: "none",
  output: HealthResponse,
  handler: async () => ({ status: "ok" as const }),
});
