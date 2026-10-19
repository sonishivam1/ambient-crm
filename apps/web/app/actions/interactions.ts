"use server";

import { randomUUID } from "node:crypto";

import { refresh } from "next/cache";
import { z } from "zod";

import { INTERACTION_TYPES, collection, getClient } from "@ambient/db";

import { audit } from "@/lib/audit";
import { getScope } from "@/lib/data/scope";

const input = z.object({
  accountId: z.string().min(1).max(200),
  type: z.enum(INTERACTION_TYPES),
  summary: z.string().trim().min(1, "Add a short summary.").max(4000, "Keep it under 4,000 characters."),
});

export type LogInteractionResult = { ok: true } | { ok: false; error: string };

/**
 * Log a note, call or meeting on an account the user can see. The interaction
 * and its audit row are written in one transaction; the audit row records that
 * something was logged, never what it said.
 */
export async function logInteraction(raw: unknown): Promise<LogInteractionResult> {
  const parsed = input.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  const { accountId, type, summary } = parsed.data;

  const scope = await getScope();
  const accounts = await collection("accounts");
  const interactions = await collection("interactions");
  const client = await getClient();
  let found = true;

  await client.withSession((session) =>
    session.withTransaction(async () => {
      const account = await accounts.findOne({ _id: accountId, ...scope.filter(), active: true }, { session });
      if (!account) {
        found = false;
        return;
      }
      const now = new Date();
      const id = randomUUID();
      await interactions.insertOne(
        {
          _id: id,
          tenantId: scope.tenantId,
          accountId,
          division: account.division,
          type,
          summary,
          authorUserId: scope.user._id,
          occurredAt: now,
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
          deletedBy: null,
        },
        { session },
      );
      await audit(
        scope.user,
        { action: "interaction.log", entity: "interaction", entityId: id, before: null, after: { accountId, type } },
        session,
      );
    }),
  );

  if (!found) return { ok: false, error: "Account not found." };
  refresh();
  return { ok: true };
}
