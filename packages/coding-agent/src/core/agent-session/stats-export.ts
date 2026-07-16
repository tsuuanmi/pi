import type { AssistantMessage } from "@tsuuanmi/pi-ai";
import { calculateContextTokens, estimateContextTokens } from "../compaction/index.ts";
import type { ContextUsage } from "../extensions/index.ts";
import { getLatestCompactionEntry } from "../session/session-manager.ts";
import type { SessionStats } from "./agent-session.ts";
import type { AgentSessionContext } from "./agent-session-context.ts";

/**
 * Phase-1 StatsExport subsystem (stateless module functions on
 * `AgentSessionContext`). Extracted verbatim from `AgentSession.getSessionStats`
 * (`agent-session.ts:2940`) and `AgentSession.getContextUsage`
 * (`agent-session.ts:2985`); the public methods on `AgentSession` now delegate
 * here. Pure structural / zero behavior change.
 */

export function computeSessionStats(ctx: AgentSessionContext): SessionStats {
	const state = ctx.state;
	const userMessages = state.messages.filter((m) => m.role === "user").length;
	const assistantMessages = state.messages.filter((m) => m.role === "assistant").length;
	const toolResults = state.messages.filter((m) => m.role === "toolResult").length;

	let toolCalls = 0;
	let totalInput = 0;
	let totalOutput = 0;
	let totalCacheRead = 0;
	let totalCacheWrite = 0;
	let totalCost = 0;

	for (const message of state.messages) {
		if (message.role === "assistant") {
			const assistantMsg = message as AssistantMessage;
			toolCalls += assistantMsg.content.filter((c) => c.type === "toolCall").length;
			totalInput += assistantMsg.usage.input;
			totalOutput += assistantMsg.usage.output;
			totalCacheRead += assistantMsg.usage.cacheRead;
			totalCacheWrite += assistantMsg.usage.cacheWrite;
			totalCost += assistantMsg.usage.cost.total;
		}
	}

	return {
		sessionFile: ctx.sessionFile,
		sessionId: ctx.sessionId,
		userMessages,
		assistantMessages,
		toolCalls,
		toolResults,
		totalMessages: state.messages.length,
		tokens: {
			input: totalInput,
			output: totalOutput,
			cacheRead: totalCacheRead,
			cacheWrite: totalCacheWrite,
			total: totalInput + totalOutput + totalCacheRead + totalCacheWrite,
		},
		cost: totalCost,
		contextUsage: computeContextUsage(ctx),
	};
}

export function computeContextUsage(ctx: AgentSessionContext): ContextUsage | undefined {
	const model = ctx.model;
	if (!model) return undefined;

	const contextWindow = model.contextWindow ?? 0;
	if (contextWindow <= 0) return undefined;

	// After compaction, the last assistant usage reflects pre-compaction context size.
	// We can only trust usage from an assistant that responded after the latest compaction.
	// If no such assistant exists, context token count is unknown until the next LLM response.
	const branchEntries = ctx.sessionManager.getBranch();
	const latestCompaction = getLatestCompactionEntry(branchEntries);

	if (latestCompaction) {
		// Check if there's a valid assistant usage after the compaction boundary
		const compactionIndex = branchEntries.lastIndexOf(latestCompaction);
		let hasPostCompactionUsage = false;
		for (let i = branchEntries.length - 1; i > compactionIndex; i--) {
			const entry = branchEntries[i];
			if (entry.type === "message" && entry.message.role === "assistant") {
				const assistant = entry.message;
				if (assistant.stopReason !== "aborted" && assistant.stopReason !== "error") {
					const contextTokens = calculateContextTokens(assistant.usage);
					if (contextTokens > 0) {
						hasPostCompactionUsage = true;
					}
					break;
				}
			}
		}

		if (!hasPostCompactionUsage) {
			return { tokens: null, contextWindow, percent: null };
		}
	}

	const estimate = estimateContextTokens(ctx.state.messages);
	const percent = (estimate.tokens / contextWindow) * 100;

	return {
		tokens: estimate.tokens,
		contextWindow,
		percent,
	};
}
