import type { SessionEntry } from "#pi/session/manager";

export function isMessageCheckpoint(entry: SessionEntry): boolean {
	return entry.type === "message" && (entry.message.role === "user" || entry.message.role === "assistant");
}
