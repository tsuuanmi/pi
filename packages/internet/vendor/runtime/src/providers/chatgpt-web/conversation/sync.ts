import { createHash } from "node:crypto";

export interface CanonicalConversationEvent {
  ordinal: number;
  sourceIndex: number;
  kind: string;
  digest: string;
  textDigest?: string;
}

export interface ConversationCheckpoint {
  authorityDigest: string;
  eventCount: number;
  prefixDigest: string;
  assistantOrdinal?: number;
  assistantDigest?: string;
}

export type ConversationSuffix =
  | { kind: "genesis"; events: CanonicalConversationEvent[]; prefixDigest: string }
  | { kind: "retry"; prefixDigest: string }
  | { kind: "append"; events: CanonicalConversationEvent[]; prefixDigest: string }
  | { kind: "diverged"; prefixDigest: string };

export function canonicalConversationEvents(input: unknown[]): CanonicalConversationEvent[] {
  return input
    .map((value, sourceIndex) => ({ value, sourceIndex }))
    .filter(({ value }) => !isGeneratedEnvironmentMessage(value))
    .map(({ value, sourceIndex }, ordinal) => ({
      ordinal,
      sourceIndex,
      kind: eventKind(value),
      digest: digest(stableJson(semanticValue(value))),
      ...(assistantText(value) !== undefined ? { textDigest: digest(assistantText(value)!) } : {}),
    }));
}

export function conversationPrefixDigest(events: CanonicalConversationEvent[], count = events.length): string {
  return digest(events.slice(0, count).map(event => `${event.ordinal}:${event.kind}:${event.digest}`).join("\n"));
}

export function conversationSuffix(
  events: CanonicalConversationEvent[],
  authorityDigest: string,
  checkpoint?: ConversationCheckpoint,
): ConversationSuffix {
  const prefixDigest = conversationPrefixDigest(events);
  if (!checkpoint) return { kind: "genesis", events, prefixDigest };
  if (checkpoint.authorityDigest !== authorityDigest) return { kind: "diverged", prefixDigest };
  if (events.length < checkpoint.eventCount) return { kind: "diverged", prefixDigest };
  if (conversationPrefixDigest(events, checkpoint.eventCount) !== checkpoint.prefixDigest) {
    return { kind: "diverged", prefixDigest };
  }
  let suffixStart = checkpoint.eventCount;
  if (checkpoint.assistantOrdinal !== undefined || checkpoint.assistantDigest !== undefined) {
    if (checkpoint.assistantOrdinal !== checkpoint.eventCount || !checkpoint.assistantDigest) {
      return { kind: "diverged", prefixDigest };
    }
    const assistantEnd = acknowledgedAssistantEnd(events, checkpoint.assistantOrdinal, checkpoint.assistantDigest);
    if (assistantEnd === undefined) return { kind: "diverged", prefixDigest };
    suffixStart = assistantEnd;
  }
  if (events.length === suffixStart) return { kind: "retry", prefixDigest };
  return { kind: "append", events: events.slice(suffixStart), prefixDigest };
}

export function acknowledgedConversationCheckpoint(
  events: CanonicalConversationEvent[],
  authorityDigest: string,
  assistant?: { ordinal: number; text: string },
): ConversationCheckpoint {
  return {
    authorityDigest,
    eventCount: events.length,
    prefixDigest: conversationPrefixDigest(events),
    ...(assistant
      ? { assistantOrdinal: assistant.ordinal, assistantDigest: digest(assistant.text) }
      : {}),
  };
}

function acknowledgedAssistantEnd(
  events: CanonicalConversationEvent[],
  start: number,
  expectedDigest: string,
): number | undefined {
  let index = start;
  let finalTextDigest: string | undefined;
  while (events[index]?.kind.endsWith(":assistant")) {
    const textDigest = events[index]?.textDigest;
    if (textDigest && textDigest !== EMPTY_TEXT_DIGEST) finalTextDigest = textDigest;
    index += 1;
  }
  return finalTextDigest === expectedDigest ? index : undefined;
}

function semanticValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(semanticValue);
  if (!isRecord(value)) return value;
  const generatedUserId = typeof value.id === "string" && value.id.startsWith("user_");
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => key !== "timestamp" && !(key === "id" && generatedUserId))
      .map(([key, nested]) => [key, semanticValue(nested)]),
  );
}

export function isGeneratedEnvironmentMessage(value: unknown): boolean {
  if (!isRecord(value) || value.role !== "user") return false;
  if (typeof value.id === "string" && value.id.startsWith("environment_")) return true;
  const content = messageText(value.content).trim();
  return content.startsWith("<environment_context>") && content.endsWith("</environment_context>");
}

function messageText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.flatMap(part => isRecord(part) && typeof part.text === "string" ? [part.text] : []).join("\n");
}

function assistantText(value: unknown): string | undefined {
  if (!isRecord(value) || value.role !== "assistant") return undefined;
  if (typeof value.content === "string") return value.content;
  if (!Array.isArray(value.content)) return undefined;
  return value.content.flatMap(part => {
    if (!isRecord(part)) return [];
    if (typeof part.text === "string") return [part.text];
    return [];
  }).join("\n");
}

function eventKind(value: unknown): string {
  if (!isRecord(value)) return typeof value;
  const type = typeof value.type === "string" ? value.type : "item";
  const role = typeof value.role === "string" ? value.role : undefined;
  return role ? `${type}:${role}` : type;
}

const EMPTY_TEXT_DIGEST = digest("");

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function stableJson(value: unknown): string {
  return JSON.stringify(value, (_key, nested) => {
    if (!isRecord(nested)) return nested;
    return Object.fromEntries(Object.entries(nested).sort(([left], [right]) => left.localeCompare(right)));
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
