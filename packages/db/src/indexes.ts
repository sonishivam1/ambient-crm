import type { IndexDescription } from "mongodb";

import { getDb, type CollectionName } from "./client";

/** Every foreign key and hot filter column gets an index, as in the current build. */
export const INDEXES: Record<CollectionName, IndexDescription[]> = {
  reps: [{ key: { code: 1 }, unique: true }, { key: { managerRepId: 1 } }],
  users: [
    { key: { email: 1 }, unique: true },
    { key: { entraOid: 1 }, unique: true, partialFilterExpression: { entraOid: { $type: "string" } } },
    { key: { repId: 1 } },
  ],
  customerGroups: [{ key: { ownerRepId: 1 } }, { key: { division: 1, health: 1 } }],
  accounts: [
    { key: { groupId: 1 } },
    { key: { parentId: 1 } },
    { key: { ownerRepId: 1, type: 1 } },
    { key: { code: 1 }, unique: true },
    { key: { name: "text", code: "text" } },
  ],
  tasks: [
    { key: { ownerRepId: 1, status: 1, dueAt: 1 } },
    { key: { accountId: 1, status: 1 } },
  ],
  visits: [{ key: { repId: 1, scheduledAt: 1 } }, { key: { accountId: 1 } }],
  notifications: [{ key: { userId: 1, createdAt: -1 } }],
  salesSnapshots: [{ key: { scope: 1, asOf: -1 } }],
  auditLog: [{ key: { at: -1 } }, { key: { entity: 1, entityId: 1, at: -1 } }, { key: { actorUserId: 1, at: -1 } }],
};

export async function ensureIndexes(): Promise<void> {
  const db = await getDb();
  for (const [name, indexes] of Object.entries(INDEXES)) {
    if (indexes.length) await db.collection(name).createIndexes(indexes);
  }
}
