import "server-only";

import { cookies } from "next/headers";
import { cache } from "react";

import { getCurrentUser, type SessionUser } from "@/lib/auth/session";
import { getRepScope, ownerFilter, type RepScope } from "@/lib/auth/visibility";
import { LENS_COOKIE, isLens, lensDivisions, type Lens } from "@/lib/lens";

export type Scope = {
  user: SessionUser;
  tenantId: string;
  reps: RepScope;
  lens: Lens;
  /** Tenant only — for collections with no owner (reps, users, notifications, lookups by id). */
  tenant: () => { tenantId: string };
  /** Tenant + rep scope + division lens — for anything owned by a rep and tagged with a division. */
  filter: (ownerField?: string) => Record<string, unknown>;
};

/**
 * Everything a query needs to stay inside what this user may see. Every query
 * in the app spreads one of these filters; none may run without it.
 */
export const getScope = cache(async (): Promise<Scope> => {
  const user = await getCurrentUser();
  const reps = await getRepScope(user);
  const saved = (await cookies()).get(LENS_COOKIE)?.value;
  const lens: Lens = user.capabilities.lens && isLens(saved) ? saved : "both";
  const divisions = lensDivisions(lens);
  const tenantId = user.tenantId;
  return {
    user,
    tenantId,
    reps,
    lens,
    tenant: () => ({ tenantId }),
    filter: (ownerField = "ownerRepId") => ({
      tenantId,
      ...ownerFilter(reps, ownerField),
      ...(divisions ? { division: { $in: divisions } } : {}),
    }),
  };
});
