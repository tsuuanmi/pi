import type { Message } from "#agent/messages/state";
import type { ToolCall } from "#agent/tool-call";

export interface MessageTurn {
	/** Messages that must be kept or dropped together to avoid orphaned tool calls/results. */
	messages: Message[];
	/** Assistant message for this turn, when present. */
	assistantMessage?: Extract<Message, { role: "assistant" }>;
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

function isAgentMessage(message: Message): message is Extract<Message, { role: "assistant" }> {
	return message.role === "assistant";
}

function isToolResultMessage(message: Message): message is Extract<Message, { role: "toolResult" }> {
	return message.role === "toolResult";
}

function getToolCalls(message: Extract<Message, { role: "assistant" }>): ToolCall[] {
	return message.content.filter((content): content is ToolCall => content.type === "toolCall");
}

function createTurn(messages: Message[]): MessageTurn {
	const assistantMessage = messages.find(isAgentMessage);
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
export function groupMessagesIntoTurns(messages: Message[]): MessageTurn[] {
	const turns: MessageTurn[] = [];
	let current: Message[] = [];
	let currentToolCallIds = new Set<string>();
	let currentHasAgent = false;

	const flush = () => {
		if (current.length === 0) return;
		turns.push(createTurn(current));
		current = [];
		currentToolCallIds = new Set<string>();
		currentHasAgent = false;
	};

	for (const message of messages) {
		if (currentHasAgent) {
			if (isToolResultMessage(message) && currentToolCallIds.has(message.toolCallId)) {
				current.push(message);
				continue;
			}
			flush();
		} else if (isToolResultMessage(message) || current.some(isToolResultMessage)) {
			flush();
		}

		current.push(message);
		if (isAgentMessage(message)) {
			currentHasAgent = true;
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

function hasOrphanToolResult(turn: MessageTurn): boolean {
	if (turn.assistantMessage) return false;
	return turn.messages.some(isToolResultMessage);
}

/**
 * Keep the newest assistant turns without splitting assistant tool calls from
 * their matching tool results.
 */
export function pruneMessagesByTurns(messages: Message[], maxTurns: number): Message[] {
	const turnLimit = normalizeTurnLimit(maxTurns);
	if (turnLimit === Number.POSITIVE_INFINITY) return messages.slice();
	if (turnLimit === 0) return [];

	const turns = groupMessagesIntoTurns(messages);
	const selectedTurns: MessageTurn[] = [];
	let agentTurnCount = 0;

	for (let index = turns.length - 1; index >= 0; index -= 1) {
		const turn = turns[index];
		if (!turn) continue;
		if (hasOrphanToolResult(turn)) continue;

		if (turn.assistantMessage) {
			if (agentTurnCount >= turnLimit) break;
			agentTurnCount += 1;
		}

		selectedTurns.unshift(turn);
	}

	return selectedTurns.flatMap((turn) => turn.messages);
}

/** Create an AgentLoopConfig-compatible transformContext sliding window. */
export function createSlidingWindowContextTransform(options: SlidingWindowContextOptions) {
	return async (messages: Message[]): Promise<Message[]> => pruneMessagesByTurns(messages, options.maxTurns);
}
