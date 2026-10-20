import { z } from "zod";

import { ROLE_KEYS } from "@ambient/db/models";

/** GET /api/v1/me: who is signed in, and in which tenant. */
export const MeResponse = z.object({
  user: z.object({
    name: z.string(),
    email: z.string(),
    role: z.enum(ROLE_KEYS),
    roleLabel: z.string(),
  }),
  tenant: z.object({
    name: z.string(),
    timeZone: z.string(),
  }),
});
export type MeResponse = z.infer<typeof MeResponse>;
