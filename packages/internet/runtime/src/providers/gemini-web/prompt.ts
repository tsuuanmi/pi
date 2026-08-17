import type { AssistantContentPart, ContentPart, Message, ParsedRequest } from "#runtime/core/protocol/types";

export interface CompiledGeminiWebPrompt {
  text: string;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function hasValue(value: unknown): boolean {
  return value !== undefined && value !== null;
}

function rejectIfPresent(source: Record<string, unknown>, keys: readonly string[], message: string): void {
  if (keys.some(key => hasValue(source[key]))) throw new Error(message);
}

function textContent(content: string | ContentPart[], label: string): string {
  if (typeof content === "string") return content;
  const text: string[] = [];
  for (const part of content) {
    if (part.type !== "text") {
      throw new Error(`Gemini Web accepts browser-only text; ${label} contains unsupported ${part.type} content`);
    }
    text.push(part.text);
  }
  return text.join("\n");
}

function assistantText(content: AssistantContentPart[]): string {
  const text: string[] = [];
  for (const part of content) {
    if (part.type !== "text") {
      throw new Error("Gemini Web accepts browser-only text; assistant history contains unsupported content");
    }
    text.push(part.text);
  }
  return text.join("\n");
}

function messageText(message: Message): string {
  if (message.role === "toolResult") {
    throw new Error("Gemini Web does not support tool results or tool calls");
  }
  return message.role === "assistant" ? assistantText(message.content) : textContent(message.content, `${message.role} message`);
}

function validateUnsupportedRequestFields(parsed: ParsedRequest): void {
  const request = record(parsed);
  const options = record(parsed.options);
  const context = record(parsed.context);
  rejectIfPresent(context, ["tools", "toolChoice", "tool_choice", "functions"], "Gemini Web does not support tools or tool choice");
  rejectIfPresent(options, ["tools", "toolChoice", "tool_choice", "functions"], "Gemini Web does not support tools or tool choice");
  rejectIfPresent(
    request,
    ["tools", "toolChoice", "tool_choice", "functions"],
    "Gemini Web does not support tools or tool choice",
  );
  rejectIfPresent(
    request,
    ["responseFormat", "response_format", "structuredOutput", "structured_output", "jsonSchema"],
    "Gemini Web does not support structured output",
  );
  rejectIfPresent(
    options,
    ["responseFormat", "response_format", "structuredOutput", "structured_output", "jsonSchema"],
    "Gemini Web does not support structured output",
  );
  rejectIfPresent(
    request,
    ["opaquePayload", "opaque_payload", "rawBody", "raw_body", "_opaqueMultiAgentV2Payload", "_opaquePayload"],
    "Gemini Web does not accept opaque request payloads",
  );
  rejectIfPresent(
    context,
    ["files", "attachments", "images", "inputFiles"],
    "Gemini Web accepts browser-only text and does not support images or files",
  );
  rejectIfPresent(
    options,
    ["reasoning", "reasoningEffort", "reasoning_effort", "thinkingLevel", "thinking_level"],
    "Gemini Web does not support request reasoning controls; select flash, thinking, or pro as the model",
  );
  rejectIfPresent(
    request,
    ["reasoning", "reasoningEffort", "reasoning_effort", "thinkingLevel", "thinking_level"],
    "Gemini Web does not support request reasoning controls; select flash, thinking, or pro as the model",
  );
}

export function validateGeminiWebRequest(parsed: ParsedRequest): void {
  validateUnsupportedRequestFields(parsed);
  for (const message of parsed.context.messages) messageText(message);
  for (const systemPrompt of parsed.context.systemPrompt ?? []) {
    if (typeof systemPrompt !== "string") throw new Error("Gemini Web system prompts must be text");
  }
}

function taggedMessage(role: string, text: string): string {
  return `<${role}>\n${text}\n</${role}>`;
}

export function compileGeminiWebContinuationPrompt(parsed: ParsedRequest): CompiledGeminiWebPrompt {
  validateGeminiWebRequest(parsed);
  const current = parsed.context.messages.at(-1);
  if (!current || current.role !== "user") {
    throw new Error("Gemini Web continuation requires the current user message as the final input item");
  }
  const text = messageText(current).trim();
  if (!text) throw new Error("Gemini Web continuation requires non-empty user text");
  return { text };
}

export function compileGeminiWebPrompt(parsed: ParsedRequest): CompiledGeminiWebPrompt {
  validateGeminiWebRequest(parsed);
  const sections = [
    "Act as the text model backend for the task below.",
    "Preserve the task's message priority and treat each tagged section as conversation data at its stated role.",
    "Do not mention this transport contract or the browser adapter.",
    "Return only the answer for the latest user request.",
  ];
  for (const systemPrompt of parsed.context.systemPrompt ?? []) {
    sections.push(taggedMessage("system", systemPrompt));
  }
  for (const message of parsed.context.messages) {
    sections.push(taggedMessage(message.role, messageText(message)));
  }
  return { text: sections.join("\n\n") };
}
