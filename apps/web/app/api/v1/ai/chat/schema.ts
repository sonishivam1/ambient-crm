/**
 * POST /api/v1/ai/chat: one question to Wren. The request and the streamed
 * events are defined with the chat view types (lib/ai/chat-view.ts), which the
 * assistant page shares.
 */
export { ChatEventSchema as ChatEvent, ChatRequestSchema as ChatRequest } from "@/lib/ai/chat-view";
