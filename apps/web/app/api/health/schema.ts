import { z } from "zod";

/** GET /api/health: liveness only; deliberately no data. */
export const HealthResponse = z.object({ status: z.literal("ok") });
