import "server-only";

import { randomUUID } from "node:crypto";

import { collection, type AiConversation, type AiTurn } from "@ambient/db";

import type { Scope } from "@/lib/data/scope";

import type { AiCardData } from "./cards";
import type { ChatTurnView, ConversationSummary } from "./chat-view";
import { cut } from "./facts";

/**
 * Wren conversations: private to their user, in their tenant. Every read and
 * write filters on both, so another user's id is simply "not found".
 */

/** Kept this long after the last turn (TTL on expiresAt). */
export const CONVERSATION_DAYS = 90;
/** At most this many turns are kept per conversation (the oldest go first). */
const MAX_TURNS = 200;

const mine = (scope: Scope) => ({ ...scope.tenant(), userId: scope.user._id });
const notExpired = () => ({ expiresAt: { $gt: new Date() } });
const expiry = (from: Date) => new Date(from.getTime() + CONVERSATION_DAYS * 86_400_000);

export const toTurnView = (t: AiTurn): ChatTurnView => ({
  id: t._id,
  role: t.role,
  text: t.text,
  bullets: t.bullets,
  followUpQuestion: t.followUpQuestion,
  cards: t.cards as AiCardData[],
  uncited: t.uncited,
  createdAt: t.createdAt.toISOString(),
});

/** The user's conversations, most recent first. */
export async function listConversations(scope: Scope, limit = 50): Promise<ConversationSummary[]> {
  const rows = await (await collection("aiConversations"))
    .find({ ...mine(scope), ...notExpired() }, { projection: { title: 1, updatedAt: 1 } })
    .sort({ updatedAt: -1, _id: 1 })
    .limit(limit)
    .toArray();
  return rows.map((c) => ({ id: c._id, title: c.title, updatedAt: c.updatedAt.toISOString() }));
}

/** One of the user's own conversations, or null. */
export async function getConversation(scope: Scope, id: string): Promise<AiConversation | null> {
  return (await collection("aiConversations")).findOne({ _id: id, ...mine(scope), ...notExpired() });
}

export function newTurn(turn: Omit<AiTurn, "_id" | "createdAt">): AiTurn {
  return { _id: randomUUID(), createdAt: new Date(), ...turn };
}

/**
 * Add a question and its answer: to the user's conversation `id`, or to a new
 * one titled after the question. Returns the conversation id, or null when
 * `id` isn't one of the user's (nothing is written then).
 */
export async function saveExchange(scope: Scope, id: string | null, question: AiTurn, answer: AiTurn): Promise<string | null> {
  const conversations = await collection("aiConversations");
  const now = new Date();
  if (!id) {
    const _id = randomUUID();
    await conversations.insertOne({
      _id,
      ...mine(scope),
      title: cut(question.text.replace(/\s+/g, " ").trim(), 60),
      turns: [question, answer],
      createdAt: now,
      updatedAt: now,
      expiresAt: expiry(now),
    });
    return _id;
  }
  const result = await conversations.updateOne(
    { _id: id, ...mine(scope), ...notExpired() },
    { $push: { turns: { $each: [question, answer], $slice: -MAX_TURNS } }, $set: { updatedAt: now, expiresAt: expiry(now) } },
  );
  return result.matchedCount === 1 ? id : null;
}

/** Delete one of the user's conversations. False when it isn't theirs. */
export async function deleteConversation(scope: Scope, id: string): Promise<boolean> {
  return (await (await collection("aiConversations")).deleteOne({ _id: id, ...mine(scope) })).deletedCount === 1;
}
