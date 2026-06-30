import type { AgentMessage } from "../../types.ts";

export interface YieldDetails {
	data: unknown;
	status: "success" | "aborted";
	error?: string;
}

/**
 * Check if an assistant message's tool results contain a yield call.
 * Returns the extracted YieldDetails if found, undefined otherwise.
 * Used by SubagentManager to detect structured completion.
 */
export function extractYieldFromMessages(messages: readonly AgentMessage[]): YieldDetails | undefined {
	// Walk messages in reverse to find the most recent yield tool result
	for (let i = messages.length - 1; i >= 0; i--) {
		const msg = messages[i];
		if (msg?.role !== "toolResult") continue;
		if (msg.toolName === "yield" && msg.details && typeof msg.details === "object") {
			return msg.details as YieldDetails;
		}
	}
	return undefined;
}
