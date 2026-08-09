import type { Message } from "@tsuuanmi/pi-agent";
import type { AssistantMessage, Usage } from "@tsuuanmi/pi-ai";
import type { CompactionSettings, ContextUsageEstimate } from "#pi/session/compaction/types";
import type { SessionEntry } from "#pi/session/manager";

/** Calculate context tokens from native usage fields. */
export function calculateContextTokens(usage: Usage): number {
	return usage.totalTokens || usage.input + usage.output + usage.cacheRead + usage.cacheWrite;
}

function assistantUsage(message: Message): Usage | undefined {
	if (message.role !== "assistant" || !("usage" in message)) return undefined;

	const assistant = message as AssistantMessage;
	if (assistant.stopReason === "aborted" || assistant.stopReason === "error") return undefined;
	return assistant.usage;
}

/** Find the last valid assistant usage in a session path. */
export function getLastAssistantUsage(entries: SessionEntry[]): Usage | undefined {
	for (let i = entries.length - 1; i >= 0; i--) {
		const entry = entries[i];
		if (entry.type !== "message") continue;

		const usage = assistantUsage(entry.message);
		if (usage) return usage;
	}
	return undefined;
}

function lastUsage(messages: Message[]): { usage: Usage; index: number } | undefined {
	for (let i = messages.length - 1; i >= 0; i--) {
		const usage = assistantUsage(messages[i]);
		if (usage) return { usage, index: i };
	}
	return undefined;
}

/** Estimate context tokens, using the last native usage and estimating trailing messages. */
export function estimateContextTokens(messages: Message[]): ContextUsageEstimate {
	const usage = lastUsage(messages);
	if (!usage) {
		const tokens = messages.reduce((total, message) => total + estimateTokens(message), 0);
		return { tokens, usageTokens: 0, trailingTokens: tokens, lastUsageIndex: null };
	}

	const usageTokens = calculateContextTokens(usage.usage);
	let trailingTokens = 0;
	for (let i = usage.index + 1; i < messages.length; i++) {
		trailingTokens += estimateTokens(messages[i]);
	}

	return {
		tokens: usageTokens + trailingTokens,
		usageTokens,
		trailingTokens,
		lastUsageIndex: usage.index,
	};
}

/** Check whether context usage exceeds the configured compaction threshold. */
export function shouldCompact(contextTokens: number, contextWindow: number, settings: CompactionSettings): boolean {
	if (!settings.enabled) return false;
	return contextTokens > contextWindow - settings.reserveTokens;
}

function textLength(content: string | Array<{ type: string; text?: string }>): number {
	if (typeof content === "string") return content.length;
	return content.reduce(
		(total, block) => (block.type === "text" && block.text ? total + block.text.length : total),
		0,
	);
}

/** Estimate a message's tokens using the conservative characters-per-four heuristic. */
export function estimateTokens(message: Message): number {
	let chars = 0;

	switch (message.role) {
		case "user":
			chars = textLength((message as { content: string | Array<{ type: string; text?: string }> }).content);
			break;
		case "assistant":
			for (const block of (message as AssistantMessage).content) {
				if (block.type === "text") chars += block.text.length;
				else if (block.type === "thinking") chars += block.thinking.length;
				else if (block.type === "toolCall") chars += block.name.length + JSON.stringify(block.arguments).length;
			}
			break;
		case "custom":
		case "toolResult":
			chars = textLength(message.content);
			break;
		case "bashExecution":
			chars = message.command.length + message.output.length;
			break;
		case "branchSummary":
		case "compactionSummary":
			chars = message.summary.length;
			break;
	}

	return Math.ceil(chars / 4);
}
