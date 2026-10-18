import "server-only";

import { cookies } from "next/headers";
import { cache } from "react";

import { getCurrentUser, type SessionUser } from "@/lib/auth/session";
import { getRepScope, ownerFilter, type RepScope } from "@/lib/auth/visibility";
import { LENS_COOKIE, isLens, lensDivisions, type Lens } from "@/lib/lens";

export type Scope = {
  user: SessionUser;
  reps: RepScope;
  lens: Lens;
  /** Filter for any collection with an owner field and a division field. */
  filter: (ownerField?: string) => Record<string, unknown>;
};

/** Everything a query needs to stay inside what this user may see. */
export const getScope = cache(async (): Promise<Scope> => {
  const user = await getCurrentUser();
  const reps = await getRepScope(user);
  const saved = (await cookies()).get(LENS_COOKIE)?.value;
  const lens: Lens = user.capabilities.lens && isLens(saved) ? saved : "both";
  const divisions = lensDivisions(lens);
  return {
    user,
    reps,
    lens,
    filter: (ownerField = "ownerRepId") => ({
      ...ownerFilter(reps, ownerField),
      ...(divisions ? { division: { $in: divisions } } : {}),
    }),
  };
});
