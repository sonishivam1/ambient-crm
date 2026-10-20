import { MongoClient, type Collection, type Db } from "mongodb";

import type {
  Account,
  AiInvocation,
  AiUsage,
  AuditEntry,
  Contact,
  Contract,
  CustomerGroup,
  Interaction,
  Notification,
  Rep,
  SalesSnapshot,
  Task,
  Tenant,
  User,
  Visit,
} from "./models";

type CollectionMap = {
  tenants: Tenant;
  reps: Rep;
  users: User;
  customerGroups: CustomerGroup;
  accounts: Account;
  tasks: Task;
  visits: Visit;
  interactions: Interaction;
  contacts: Contact;
  contracts: Contract;
  notifications: Notification;
  salesSnapshots: SalesSnapshot;
  auditLog: AuditEntry;
  aiInvocations: AiInvocation;
  aiUsage: AiUsage;
};

export type CollectionName = keyof CollectionMap;

// Reuse one client per process. In development, Next.js hot reload re-imports
// modules, so the client is parked on globalThis to avoid leaking connections.
const globalForMongo = globalThis as unknown as { ambientMongo?: Promise<MongoClient> };

function config() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not set. Copy .env.example and fill it in.");
  return { uri, dbName: process.env.MONGODB_DB ?? "ambient_crm" };
}

export function getClient(): Promise<MongoClient> {
  if (!globalForMongo.ambientMongo) {
    const { uri } = config();
    globalForMongo.ambientMongo = new MongoClient(uri, { appName: "ambient-crm" }).connect();
  }
  return globalForMongo.ambientMongo;
}

export async function getDb(): Promise<Db> {
  return (await getClient()).db(config().dbName);
}

export async function collection<N extends CollectionName>(
  name: N,
): Promise<Collection<CollectionMap[N]>> {
  return (await getDb()).collection<CollectionMap[N]>(name);
}

export async function closeClient(): Promise<void> {
  if (globalForMongo.ambientMongo) {
    await (await globalForMongo.ambientMongo).close();
    globalForMongo.ambientMongo = undefined;
  }
}
