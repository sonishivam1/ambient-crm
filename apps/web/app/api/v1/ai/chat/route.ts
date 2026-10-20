import { runChatTurn } from "@/lib/ai/chat";
import type { ChatEvent as ChatEventT } from "@/lib/ai/chat-view";
import { defineRoute } from "@/lib/api/route";

import { ChatEvent, ChatRequest } from "./schema";

/**
 * Ask Wren one question. Streams newline-delimited JSON: progress lines while
 * tools run, then one verified answer (or one error). The answer text is never
 * streamed before it is checked.
 */
export const POST = defineRoute({
  name: "ai.chat",
  version: 1,
  auth: "user",
  input: ChatRequest,
  stream: {
    events: ChatEvent,
    run: async ({ input }, send: (event: ChatEventT) => void) => {
      const result = await runChatTurn(input, (text) => send({ type: "progress", text }));
      send(result.ok ? { type: "answer", conversationId: result.conversationId, question: result.question, answer: result.answer } : { type: "error", reason: result.reason, message: result.message });
    },
  },
});
