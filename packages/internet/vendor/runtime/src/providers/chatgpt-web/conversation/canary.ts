import { parseConversationUrl } from "#runtime/providers/chatgpt-web/conversation/journal";

export const CONVERSATION_CANARY_PROMPT = "Reply briefly and include: PI_DURABLE_CONVERSATION_CANARY_OK";

export function validateConversationCanary(response: string, conversationUrl: string): string {
  if (!response.trim()) throw new Error("Durable conversation canary returned an empty response");
  return parseConversationUrl(conversationUrl).url;
}
