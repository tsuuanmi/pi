import type { AgentMessage } from "#agent/messages/state";
import type { ToolCall } from "#agent/tool-call";

export interface AgentMessageTurn {
	/** Messages that must be kept or dropped together to avoid orphaned tool calls/results. */
	messages: AgentMessage[];
	/** Assistant message for this turn, when present. */
	assistantMessage?: Extract<AgentMessage, { role: "assistant" }>;
	/** Tool call ids requested by the assistant message in this turn. */
	toolCallIds: string[];
	/** Matching tool result ids included in this turn. */
	toolResultIds: string[];
	/** True when every assistant tool call in this turn has a matching tool result message. */
	hasCompleteToolResults: boolean;
}

export interface SlidingWindowContextOptions {
	/** Number of most recent assistant turns to preserve. Values less than 1 return no assistant turns. */
	maxTurns: number;
}

function isAssistantMessage(message: AgentMessage): message is Extract<AgentMessage, { role: "assistant" }> {
	return message.role === "assistant";
}

function isToolResultMessage(message: AgentMessage): message is Extract<AgentMessage, { role: "toolResult" }> {
	return message.role === "toolResult";
}

function getToolCalls(message: Extract<AgentMessage, { role: "assistant" }>): ToolCall[] {
	return message.content.filter((content): content is ToolCall => content.type === "toolCall");
}

function createTurn(messages: AgentMessage[]): AgentMessageTurn {
	const assistantMessage = messages.find(isAssistantMessage);
	const toolCallIds = assistantMessage ? getToolCalls(assistantMessage).map((toolCall) => toolCall.id) : [];
	const toolCallIdSet = new Set(toolCallIds);
	const toolResultIds = messages
		.filter(isToolResultMessage)
		.map((message) => message.toolCallId)
		.filter((toolCallId) => toolCallIdSet.has(toolCallId));
	const toolResultIdSet = new Set(toolResultIds);

	return {
		messages,
		assistantMessage,
		toolCallIds,
		toolResultIds,
		hasCompleteToolResults: toolCallIds.every((toolCallId) => toolResultIdSet.has(toolCallId)),
	};
}

/**
 * Group messages into pruning-safe turns.
 *
 * Each returned turn keeps one assistant message together with any immediately
 * following tool results that match that assistant's tool calls. Messages before
 * an assistant are attached to that assistant turn, so pruning by turns keeps the
 * user/context message that caused the preserved response.
 */
export function groupAgentMessagesIntoTurns(messages: AgentMessage[]): AgentMessageTurn[] {
	const turns: AgentMessageTurn[] = [];
	let current: AgentMessage[] = [];
	let currentToolCallIds = new Set<string>();
	let currentHasAssistant = false;

	const flush = () => {
		if (current.length === 0) return;
		turns.push(createTurn(current));
		current = [];
		currentToolCallIds = new Set<string>();
		currentHasAssistant = false;
	};

	for (const message of messages) {
		if (currentHasAssistant) {
			if (isToolResultMessage(message) && currentToolCallIds.has(message.toolCallId)) {
				current.push(message);
				continue;
			}
			flush();
		} else if (isToolResultMessage(message) || current.some(isToolResultMessage)) {
			flush();
		}

		current.push(message);
		if (isAssistantMessage(message)) {
			currentHasAssistant = true;
			currentToolCallIds = new Set(getToolCalls(message).map((toolCall) => toolCall.id));
		}
	}

	flush();
	return turns;
}

function normalizeTurnLimit(maxTurns: number): number {
	if (!Number.isFinite(maxTurns)) return Number.POSITIVE_INFINITY;
	return Math.max(0, Math.floor(maxTurns));
}

function hasOrphanToolResult(turn: AgentMessageTurn): boolean {
	if (turn.assistantMessage) return false;
	return turn.messages.some(isToolResultMessage);
}

/**
 * Keep the newest assistant turns without splitting assistant tool calls from
 * their matching tool results.
 */
export function pruneAgentMessagesByTurns(messages: AgentMessage[], maxTurns: number): AgentMessage[] {
	const turnLimit = normalizeTurnLimit(maxTurns);
	if (turnLimit === Number.POSITIVE_INFINITY) return messages.slice();
	if (turnLimit === 0) return [];

	const turns = groupAgentMessagesIntoTurns(messages);
	const selectedTurns: AgentMessageTurn[] = [];
	let assistantTurnCount = 0;

	for (let index = turns.length - 1; index >= 0; index -= 1) {
		const turn = turns[index];
		if (!turn) continue;
		if (hasOrphanToolResult(turn)) continue;

		if (turn.assistantMessage) {
			if (assistantTurnCount >= turnLimit) break;
			assistantTurnCount += 1;
		}

		selectedTurns.unshift(turn);
	}

	return selectedTurns.flatMap((turn) => turn.messages);
}

/** Create an AgentLoopConfig-compatible transformContext sliding window. */
export function createSlidingWindowContextTransform(options: SlidingWindowContextOptions) {
	return async (messages: AgentMessage[]): Promise<AgentMessage[]> =>
		pruneAgentMessagesByTurns(messages, options.maxTurns);
}
