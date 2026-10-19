import "server-only";

import { randomUUID } from "node:crypto";

import { collection, type ClientSession } from "@ambient/db";

import type { SessionUser } from "./auth/session";

type AuditInput = {
  action: string;
  entity: string;
  entityId: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
};

/** Write one audit row. Pass the transaction session so it commits with the change it records. */
export async function audit(actor: SessionUser, entry: AuditInput, session?: ClientSession) {
  await (await collection("auditLog")).insertOne(
    { _id: randomUUID(), tenantId: actor.tenantId, at: new Date(), actorUserId: actor._id, impersonatedUserId: null, ...entry },
    { session },
  );
}
