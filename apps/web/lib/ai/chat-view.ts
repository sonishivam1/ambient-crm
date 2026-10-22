import { z } from "zod";

import type { AiCardData } from "./cards";
import type { FeedbackVote } from "./feedback-view";
import type { ProposalView } from "./proposal-view";

/**
 * What the assistant page receives: turns as they were shown, and the events
 * of POST /api/v1/ai/chat. Safe in client components.
 */

export type ChatTurnView = {
  id: string;
  role: "user" | "assistant";
  text: string;
  bullets: string[];
  followUpQuestion: string | null;
  cards: AiCardData[];
  /** An answer that cited no records. */
  uncited: boolean;
  /** Records this answer prepared for the user to accept, with their live status. */
  proposals: ProposalView[];
  /** The user's own 👍 / 👎 on this answer. */
  vote: FeedbackVote | null;
  createdAt: string;
};

export type ChatEvent =
  | { type: "progress"; text: string }
  | { type: "answer"; conversationId: string; question: ChatTurnView; answer: ChatTurnView }
  | { type: "error"; reason: string; message: string };

const TurnSchema = z.object({
  id: z.string(),
  role: z.enum(["user", "assistant"]),
  text: z.string(),
  bullets: z.array(z.string()),
  followUpQuestion: z.string().nullable(),
  cards: z.array(z.object({ kind: z.string(), handle: z.string(), href: z.string() }).passthrough()),
  uncited: z.boolean(),
  proposals: z.array(z.object({ id: z.string(), kind: z.enum(["task", "visit", "note"]), status: z.string() }).passthrough()),
  vote: z.object({ rating: z.enum(["up", "down"]), reason: z.string().nullable() }).nullable(),
  createdAt: z.string(),
});

/**
 * The chat route's events: checked before each is sent, so nothing undeclared
 * leaves the server. Cards are checked for their common fields; their full
 * shapes come from the card types.
 */
export const ChatEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("progress"), text: z.string().max(200) }),
  z.object({ type: z.literal("answer"), conversationId: z.string(), question: TurnSchema, answer: TurnSchema }),
  z.object({ type: z.literal("error"), reason: z.string(), message: z.string() }),
]) as unknown as z.ZodType<ChatEvent>;

export const ChatRequestSchema = z.object({
  conversationId: z.string().min(1).max(100).nullable().default(null),
  message: z.string().trim().min(1, "Type a question.").max(1000, "Keep questions under 1,000 characters."),
});
export type ChatRequest = z.infer<typeof ChatRequestSchema>;

export type ConversationSummary = { id: string; title: string; updatedAt: string };
