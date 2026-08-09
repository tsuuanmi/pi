import type { Message } from "@tsuuanmi/pi-agent";
import { createBranchSummaryMessage, createCompactionSummaryMessage, createCustomMessage } from "@tsuuanmi/pi-agent";
import type { SessionEntry } from "#pi/session/manager";

export interface EntryMessageOptions {
	includeCompaction?: boolean;
	includeToolResults?: boolean;
}

/** Convert a persisted session entry into an agent message when it contributes to context. */
export function entryToMessage(entry: SessionEntry, options: EntryMessageOptions = {}): Message | undefined {
	const { includeCompaction = true, includeToolResults = true } = options;

	switch (entry.type) {
		case "message":
			if (!includeToolResults && entry.message.role === "toolResult") return undefined;
			return entry.message;
		case "custom_message":
			return createCustomMessage(entry.customType, entry.content, entry.display, entry.details, entry.timestamp);
		case "branch_summary":
			return createBranchSummaryMessage(entry.summary, entry.fromId, entry.timestamp);
		case "compaction":
			if (!includeCompaction) return undefined;
			return createCompactionSummaryMessage(entry.summary, entry.tokensBefore, entry.timestamp);
		case "thinking_level_change":
		case "model_change":
		case "custom":
		case "label":
		case "session_info":
			return undefined;
	}
}
