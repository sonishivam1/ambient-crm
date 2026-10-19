import type { Db, IndexDescription } from "mongodb";

import { getDb, type CollectionName } from "./client";

/**
 * Every index starts with tenantId (ADR 0004), then covers each foreign key and
 * hot filter. Uniqueness is per tenant unless the value is globally unique.
 */
export const INDEXES: Record<CollectionName, IndexDescription[]> = {
  tenants: [{ key: { entraTenantId: 1 }, unique: true, partialFilterExpression: { entraTenantId: { $type: "string" } } }],
  reps: [{ key: { tenantId: 1, code: 1 }, unique: true }, { key: { tenantId: 1, managerRepId: 1 } }],
  users: [
    { key: { tenantId: 1, email: 1 }, unique: true },
    // Entra object ids are globally unique, so this one is not tenant-prefixed.
    { key: { entraOid: 1 }, unique: true, partialFilterExpression: { entraOid: { $type: "string" } } },
    { key: { tenantId: 1, repId: 1 } },
  ],
  customerGroups: [
    { key: { tenantId: 1, ownerRepId: 1, fyRevenue: -1 } },
    { key: { tenantId: 1, division: 1, health: 1 } },
    { key: { tenantId: 1, fyRevenue: -1 } },
    { key: { tenantId: 1, name: 1 } },
  ],
  accounts: [
    { key: { tenantId: 1, groupId: 1, type: 1 } },
    { key: { tenantId: 1, parentId: 1 } },
    { key: { tenantId: 1, ownerRepId: 1, type: 1, fyRevenue: -1 } },
    { key: { tenantId: 1, type: 1, fyRevenue: -1 } },
    { key: { tenantId: 1, code: 1 }, unique: true },
  ],
  tasks: [
    { key: { tenantId: 1, ownerRepId: 1, status: 1, dueAt: 1 } },
    { key: { tenantId: 1, accountId: 1, status: 1 } },
  ],
  visits: [
    { key: { tenantId: 1, repId: 1, scheduledAt: 1 } },
    { key: { tenantId: 1, scheduledAt: 1 } },
    { key: { tenantId: 1, accountId: 1 } },
  ],
  interactions: [{ key: { tenantId: 1, accountId: 1, occurredAt: -1 } }],
  contacts: [
    { key: { tenantId: 1, accountId: 1, active: 1 } },
    { key: { tenantId: 1, ownerRepId: 1, lastName: 1, firstName: 1 } },
    { key: { tenantId: 1, lastName: 1, firstName: 1 } },
    // Uniqueness is checked in the write path (deleted contacts may share an email).
    { key: { tenantId: 1, email: 1 } },
  ],
  notifications: [{ key: { tenantId: 1, userId: 1, createdAt: -1 } }],
  salesSnapshots: [{ key: { tenantId: 1, scope: 1, asOf: -1 } }],
  auditLog: [
    { key: { tenantId: 1, at: -1 } },
    { key: { tenantId: 1, entity: 1, entityId: 1, at: -1 } },
    { key: { tenantId: 1, actorUserId: 1, at: -1 } },
  ],
};

/** Create every index; defaults to the configured database. */
export async function ensureIndexes(target?: Db): Promise<void> {
  const db = target ?? (await getDb());
  for (const [name, indexes] of Object.entries(INDEXES)) {
    if (indexes.length) await db.collection(name).createIndexes(indexes);
  }
}
