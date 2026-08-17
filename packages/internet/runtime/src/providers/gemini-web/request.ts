import type {
  AssistantContentPart,
  ContentPart,
  Message,
  ParsedRequest,
} from "#runtime/core/protocol/types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`Gemini Web request requires ${label}`);
  return value;
}

function textContent(value: unknown): string | ContentPart[] {
  if (typeof value === "string") return value;
  if (!Array.isArray(value)) throw new Error("Gemini Web messages require text content");
  const parts: ContentPart[] = [];
  for (const part of value) {
    if (!isRecord(part)) throw new Error("Gemini Web message content is invalid");
    if (part.type === "input_image" || part.type === "input_file") {
      throw new Error("Gemini Web does not support images or files");
    }
    if (part.type !== "input_text" && part.type !== "output_text" && part.type !== "text") {
      throw new Error(`Gemini Web does not support content type: ${String(part.type)}`);
    }
    parts.push({ type: "text", text: requiredString(part.text, "message text") });
  }
  return parts;
}

function inputMessage(item: unknown, timestamp: number, systemPrompt: string[]): Message | undefined {
  if (typeof item === "string") return { role: "user", content: item, timestamp };
  if (!isRecord(item)) throw new Error("Gemini Web input items must be messages");
  if (item.type !== undefined && item.type !== "message") {
    throw new Error(`Gemini Web does not support input item type: ${String(item.type)}`);
  }
  const role = requiredString(item.role, "a message role");
  const content = textContent(item.content);
  if (role === "system") {
    systemPrompt.push(typeof content === "string" ? content : content.map(part => part.type === "text" ? part.text : "").join("\n"));
    return undefined;
  }
  if (role === "user") return { role, content, timestamp };
  if (role === "developer") return { role, content, timestamp };
  if (role === "assistant") {
    const assistantContent: AssistantContentPart[] = (typeof content === "string"
      ? [{ type: "text", text: content }]
      : content) as AssistantContentPart[];
    return { role, content: assistantContent, timestamp };
  }
  throw new Error(`Gemini Web does not support message role: ${role}`);
}

export function parseGeminiWebRequest(value: unknown): ParsedRequest {
  if (!isRecord(value)) throw new Error("Gemini Web request body must be an object");
  const modelId = requiredString(value.model, "a model");
  if (!modelId.startsWith("gemini-web/")) throw new Error(`Invalid Gemini Web model: ${modelId}`);
  if (!Array.isArray(value.input)) throw new Error("Gemini Web request requires an input array");
  if (Array.isArray(value.tools) && value.tools.length > 0) throw new Error("Gemini Web does not support tools");
  if (value.tool_choice !== undefined && value.tool_choice !== null && value.tool_choice !== "none") {
    throw new Error("Gemini Web does not support tool choice");
  }
  if (value.reasoning !== undefined && value.reasoning !== null) {
    throw new Error("Gemini Web does not support reasoning controls");
  }
  if (value.response_format !== undefined || (isRecord(value.text) && value.text.format !== undefined)) {
    throw new Error("Gemini Web does not support structured output");
  }
  if (value.encrypted_content !== undefined) throw new Error("Gemini Web does not support opaque request payloads");

  const systemPrompt = typeof value.instructions === "string" && value.instructions.trim()
    ? [value.instructions]
    : [];
  const timestamp = Date.now();
  const messages = value.input
    .map(item => inputMessage(item, timestamp, systemPrompt))
    .filter((message): message is Message => message !== undefined);
  if (messages.length === 0) throw new Error("Gemini Web request requires a text message");

  const metadata = isRecord(value.metadata) ? value.metadata : undefined;
  const caller = metadata && isRecord(metadata.pi_caller) ? metadata.pi_caller : undefined;
  const sessionId = caller && typeof caller.session_id === "string" ? caller.session_id.trim() : "";
  if (!sessionId) throw new Error("Gemini Web request requires a Pi session identity");
  return {
    modelId,
    previousResponseId: typeof value.previous_response_id === "string" ? value.previous_response_id : undefined,
    context: { ...(systemPrompt.length > 0 ? { systemPrompt } : {}), messages },
    stream: value.stream === true,
    options: {},
    sessionId,
  };
}
