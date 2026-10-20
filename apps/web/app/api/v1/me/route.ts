import { defineRoute } from "@/lib/api/route";

import { MeResponse } from "./schema";

/** The signed-in user and their tenant (the Outlook add-in's first call). */
export const GET = defineRoute({
  name: "me",
  version: 1,
  auth: "user",
  output: MeResponse,
  handler: async ({ scope }) => ({
    user: { name: scope.user.name, email: scope.user.email, role: scope.user.role, roleLabel: scope.user.capabilities.label },
    tenant: { name: scope.user.tenant.name, timeZone: scope.timeZone },
  }),
});
