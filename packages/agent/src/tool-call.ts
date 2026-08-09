import type { AssistantMessage } from "@tsuuanmi/pi-ai";

export type ToolCall = Extract<AssistantMessage["content"][number], { type: "toolCall" }>;
