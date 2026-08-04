import { createHash } from "node:crypto";
import { isAbsolute, normalize, resolve } from "node:path";
import type { AgentMessage } from "@tsuuanmi/pi-agent";
import type { AssistantMessage, ToolCall, ToolResultMessage } from "@tsuuanmi/pi-ai";

export interface ToolResultOptions {
	dedupeReadResults: boolean;
	summarizeStaleToolResults: boolean;
	toolResultMaxBytes: number;
	cwd?: string;
}

type ToolCallInfo = {
	id: string;
	name: string;
	arguments: Record<string, unknown>;
};

type ReadKey = {
	path: string;
	offset: number | null;
	limit: number | null;
};

type ToolResultRecord = {
	messageIndex: number;
	message: ToolResultMessage;
	call?: ToolCallInfo;
	bytes: number;
	lines: number;
	sha256: string;
	alreadySummarized: boolean;
	protected: boolean;
	readKey?: ReadKey;
	segment: number;
};

type SummaryPolicy =
	| { policy: "read_duplicate"; duplicateOfToolCallId: string; retainedByPolicy: "newest_duplicate" }
	| { policy: "stale_budget"; duplicateOfToolCallId: null; retainedByPolicy: "tool_result_budget" };

export type SummaryLedger = Map<string, SummaryPolicy>;

const MIN_STALE_BYTES = 2_048;
const PROTECTED_BATCHES = 2;
const SUMMARY_START = "[Pi retained tool-result summary v1]";
const SUMMARY_END = "[/Pi retained tool-result summary]";

function byteLength(value: string): number {
	return Buffer.byteLength(value, "utf8");
}

function countLines(value: string): number {
	if (!value) return 0;
	return value.split(/\r?\n/).length;
}

function sha256(value: string): string {
	return createHash("sha256").update(value, "utf8").digest("hex");
}

function textOf(message: ToolResultMessage): string {
	return message.content.map((block) => block.text).join("");
}

function isSummary(text: string): boolean {
	return text.startsWith(SUMMARY_START) && text.includes(SUMMARY_END);
}

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toolCalls(message: AssistantMessage): ToolCallInfo[] {
	return message.content
		.filter((block): block is ToolCall => block.type === "toolCall")
		.filter((block) => typeof block.id === "string" && typeof block.name === "string" && isObject(block.arguments))
		.map((block) => ({
			id: block.id,
			name: block.name,
			arguments: block.arguments,
		}));
}

function positiveInteger(value: unknown): number | null | undefined {
	if (value === undefined) return null;
	if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) return undefined;
	return value;
}

function normalizePath(value: unknown, cwd: string | undefined): string | undefined {
	if (typeof value !== "string" || value.length === 0) return undefined;
	if (!cwd) return normalize(value);
	return normalize(isAbsolute(value) ? value : resolve(cwd, value));
}

function readKey(call: ToolCallInfo | undefined, cwd: string | undefined): ReadKey | undefined {
	if (!call || call.name !== "read") return undefined;
	const path = normalizePath(call.arguments.path, cwd);
	const offset = positiveInteger(call.arguments.offset);
	const limit = positiveInteger(call.arguments.limit);
	if (!path || offset === undefined || limit === undefined) return undefined;
	return { path, offset, limit };
}

function mutationPath(call: ToolCallInfo | undefined, cwd: string | undefined): string | undefined {
	if (!call || (call.name !== "edit" && call.name !== "write")) return undefined;
	return normalizePath(call.arguments.path, cwd);
}

function keyOf(key: ReadKey): string {
	return `${key.path}\u0000${key.offset ?? ""}\u0000${key.limit ?? ""}`;
}

function hasLaterAssistant(messages: AgentMessage[], afterIndex: number): boolean {
	return messages.slice(afterIndex + 1).some((message) => message.role === "assistant");
}

function protectedIndices(messages: AgentMessage[]): Set<number> {
	const batches: Array<{ resultIndices: number[]; lastResultIndex: number; consumed: boolean }> = [];
	for (let index = 0; index < messages.length; index++) {
		const message = messages[index];
		if (message.role !== "assistant" || !message.content.some((block) => block.type === "toolCall")) continue;
		const resultIndices: number[] = [];
		let cursor = index + 1;
		while (cursor < messages.length && messages[cursor]?.role === "toolResult") {
			resultIndices.push(cursor);
			cursor++;
		}
		if (resultIndices.length === 0) continue;
		const lastResultIndex = resultIndices[resultIndices.length - 1];
		batches.push({ resultIndices, lastResultIndex, consumed: hasLaterAssistant(messages, lastResultIndex) });
	}

	const protectedResults = new Set<number>();
	const unconsumed = batches.filter((batch) => !batch.consumed).at(-1);
	for (const index of unconsumed?.resultIndices ?? []) protectedResults.add(index);
	for (const batch of batches.filter((batch) => batch.consumed).slice(-PROTECTED_BATCHES)) {
		for (const index of batch.resultIndices) protectedResults.add(index);
	}
	return protectedResults;
}

function records(messages: AgentMessage[], cwd: string | undefined): ToolResultRecord[] {
	const calls = new Map<string, ToolCallInfo>();
	for (let index = 0; index < messages.length; index++) {
		const message = messages[index];
		if (message.role !== "assistant") continue;
		for (const call of toolCalls(message)) calls.set(call.id, call);
	}

	const protectedResults = protectedIndices(messages);
	const segments = new Map<string, number>();
	const result: ToolResultRecord[] = [];
	for (let index = 0; index < messages.length; index++) {
		const message = messages[index];
		if (message.role !== "toolResult") continue;
		const call = calls.get(message.toolCallId);
		const text = textOf(message);
		const currentReadKey = readKey(call, cwd);
		const currentMutationPath = !message.isError ? mutationPath(call, cwd) : undefined;
		const segment = currentReadKey ? (segments.get(currentReadKey.path) ?? 0) : 0;
		result.push({
			messageIndex: index,
			message,
			call,
			bytes: byteLength(text),
			lines: countLines(text),
			sha256: sha256(text),
			alreadySummarized: isSummary(text),
			protected: protectedResults.has(index),
			readKey: currentReadKey,
			segment,
		});
		if (currentMutationPath) segments.set(currentMutationPath, (segments.get(currentMutationPath) ?? 0) + 1);
	}
	return result;
}

function duplicateSummaries(
	items: ToolResultRecord[],
	existing: ReadonlyMap<number, SummaryPolicy>,
): { summaries: Map<number, SummaryPolicy>; pinned: Set<number> } {
	const summaries = new Map<number, SummaryPolicy>();
	const pinned = new Set<number>();
	const groups = new Map<string, ToolResultRecord[]>();
	for (const item of items) {
		if (
			item.message.toolName !== "read" ||
			item.message.isError ||
			item.alreadySummarized ||
			existing.has(item.messageIndex) ||
			!item.readKey ||
			!item.call
		) {
			continue;
		}
		const key = `${keyOf(item.readKey)}\u0000${item.segment}\u0000${item.sha256}\u0000${item.bytes}`;
		const group = groups.get(key) ?? [];
		group.push(item);
		groups.set(key, group);
	}

	for (const group of groups.values()) {
		if (group.length < 2) continue;
		const newest = group[group.length - 1];
		pinned.add(newest.messageIndex);
		for (const item of group.slice(0, -1)) {
			if (item.protected) continue;
			summaries.set(item.messageIndex, {
				policy: "read_duplicate",
				duplicateOfToolCallId: newest.message.toolCallId,
				retainedByPolicy: "newest_duplicate",
			});
		}
	}
	return { summaries, pinned };
}

function staleSummaries(
	items: ToolResultRecord[],
	summaries: Map<number, SummaryPolicy>,
	pinned: Set<number>,
	maxBytes: number,
): void {
	const eligible = new Set(["read", "bash", "edit"]);
	const candidates = items.filter(
		(item) =>
			eligible.has(item.message.toolName) &&
			!item.protected &&
			!item.message.isError &&
			!item.alreadySummarized &&
			!summaries.has(item.messageIndex) &&
			!pinned.has(item.messageIndex) &&
			item.bytes >= MIN_STALE_BYTES,
	);
	let retained = items
		.filter(
			(item) =>
				eligible.has(item.message.toolName) && !item.protected && !item.message.isError && !item.alreadySummarized,
		)
		.reduce((total, item) => total + (summaries.has(item.messageIndex) ? 0 : item.bytes), 0);

	for (const item of candidates) {
		if (retained <= maxBytes) break;
		summaries.set(item.messageIndex, {
			policy: "stale_budget",
			duplicateOfToolCallId: null,
			retainedByPolicy: "tool_result_budget",
		});
		retained -= item.bytes;
	}
}

function render(item: ToolResultRecord, policy: SummaryPolicy): string {
	const command = typeof item.call?.arguments.command === "string" ? item.call.arguments.command : undefined;
	const summary = {
		commandSha256: command ? sha256(command) : null,
		duplicateOfToolCallId: policy.duplicateOfToolCallId,
		invalidatedByToolCallId: null,
		limit: item.readKey?.limit ?? null,
		offset: item.readKey?.offset ?? null,
		originalBytes: item.bytes,
		originalLines: item.lines,
		originalSha256: item.sha256,
		path: item.readKey?.path ?? null,
		policy: policy.policy,
		retainedByPolicy: policy.retainedByPolicy,
		toolCallId: item.message.toolCallId,
		toolName: item.message.toolName,
	};
	return `${SUMMARY_START}\n${JSON.stringify(summary)}\n${SUMMARY_END}`;
}

function applySummaries(
	messages: AgentMessage[],
	items: ToolResultRecord[],
	summaries: Map<number, SummaryPolicy>,
): AgentMessage[] {
	if (summaries.size === 0) return messages;
	const recordsByIndex = new Map(items.map((item) => [item.messageIndex, item]));
	let changed = false;
	const optimized = messages.map((message, index): AgentMessage => {
		const policy = summaries.get(index);
		const item = recordsByIndex.get(index);
		if (!policy || !item || message.role !== "toolResult") return message;
		changed = true;
		return { ...message, content: [{ type: "text", text: render(item, policy) }] } as AgentMessage;
	});
	return changed ? optimized : messages;
}

function seed(items: ToolResultRecord[], ledger: SummaryLedger): Map<number, SummaryPolicy> {
	const summaries = new Map<number, SummaryPolicy>();
	for (const item of items) {
		if (item.alreadySummarized) continue;
		const policy = ledger.get(item.message.toolCallId);
		if (policy) summaries.set(item.messageIndex, policy);
	}
	return summaries;
}

function remember(
	items: ToolResultRecord[],
	summaries: ReadonlyMap<number, SummaryPolicy>,
	ledger: SummaryLedger,
): void {
	for (const item of items) {
		if (item.alreadySummarized) continue;
		const policy = summaries.get(item.messageIndex);
		if (policy) ledger.set(item.message.toolCallId, policy);
	}
}

export function optimizeToolResults(
	messages: AgentMessage[],
	options: ToolResultOptions,
	ledger: SummaryLedger,
): AgentMessage[] {
	if (!options.dedupeReadResults && !options.summarizeStaleToolResults) return messages;
	const items = records(messages, options.cwd);
	if (items.length === 0) return messages;
	const summaries = seed(items, ledger);
	const pinned = new Set<number>();
	if (options.dedupeReadResults) {
		const duplicate = duplicateSummaries(items, summaries);
		for (const [index, policy] of duplicate.summaries) summaries.set(index, policy);
		for (const index of duplicate.pinned) pinned.add(index);
	}
	if (options.summarizeStaleToolResults) staleSummaries(items, summaries, pinned, options.toolResultMaxBytes);
	remember(items, summaries, ledger);
	return applySummaries(messages, items, summaries);
}
