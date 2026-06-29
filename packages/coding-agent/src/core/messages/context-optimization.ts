import { createHash } from "node:crypto";
import { isAbsolute, normalize, resolve } from "node:path";
import type { AgentMessage } from "@tsuuanmi/pi-agent-core";
import type { AssistantMessage, TextContent, ThinkingContent, ToolCall, ToolResultMessage } from "@tsuuanmi/pi-ai";
import type { BashExecutionMessage } from "./messages.ts";

export interface RetainedContextOptimizationOptions {
	stripThinking: boolean;
	compressBashOutput: boolean;
	bashMaxBytes: number;
	dedupeReadResults: boolean;
	summarizeStaleToolResults: boolean;
	toolResultMaxBytes: number;
	cwd?: string;
}

const DEFAULT_BASH_HEAD_BYTES = 4_096;
const MAX_MARKER_PATH_BYTES = 512;
const PROTECTED_RECENT_CONSUMED_BATCHES = 2;
const MIN_STALE_TOOL_RESULT_BYTES = 2_048;
const SUMMARY_START = "[Pi retained tool-result summary v1]";
const SUMMARY_END = "[/Pi retained tool-result summary]";

type ToolCallMetadata = {
	id: string;
	name: string;
	arguments: Record<string, unknown>;
	assistantIndex: number;
};

type ReadKey = {
	path: string;
	offset: number | null;
	limit: number | null;
};

type ToolResultRecord = {
	messageIndex: number;
	message: ToolResultMessage;
	call?: ToolCallMetadata;
	text: string;
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

function utf8ByteLength(value: string): number {
	return Buffer.byteLength(value, "utf8");
}

function takeUtf8Prefix(value: string, maxBytes: number): string {
	let bytes = 0;
	let result = "";
	for (const char of value) {
		const nextBytes = utf8ByteLength(char);
		if (bytes + nextBytes > maxBytes) break;
		result += char;
		bytes += nextBytes;
	}
	return result;
}

function takeUtf8Suffix(value: string, maxBytes: number): string {
	let bytes = 0;
	let result = "";
	const chars = Array.from(value);
	for (let index = chars.length - 1; index >= 0; index--) {
		const char = chars[index];
		const nextBytes = utf8ByteLength(char);
		if (bytes + nextBytes > maxBytes) break;
		result = char + result;
		bytes += nextBytes;
	}
	return result;
}

function truncatePathForMarker(path: string): string {
	if (utf8ByteLength(path) <= MAX_MARKER_PATH_BYTES) return path;
	const separator = "…";
	const separatorBytes = utf8ByteLength(separator);
	const sideBudget = Math.max(0, Math.floor((MAX_MARKER_PATH_BYTES - separatorBytes) / 2));
	return `${takeUtf8Prefix(path, sideBudget)}${separator}${takeUtf8Suffix(path, sideBudget)}`;
}

function countLines(value: string): number {
	if (!value) return 0;
	return value.split(/\r?\n/).length;
}

function sha256(value: string): string {
	return createHash("sha256").update(value, "utf8").digest("hex");
}

export function compressBashReplayOutput(
	output: string,
	options: { maxBytes: number; fullOutputPath?: string },
): string {
	const maxBytes = Math.max(1, Math.floor(options.maxBytes));
	if (utf8ByteLength(output) <= maxBytes) return output;

	const fullOutputPath = options.fullOutputPath ? truncatePathForMarker(options.fullOutputPath) : "unavailable";
	let marker = `[Pi retained-context compression: omitted 0 bytes / 0 lines from bash output. Full output: ${fullOutputPath}.]`;
	if (utf8ByteLength(marker) > maxBytes) {
		marker = "[Pi retained-context compression: output omitted. Full output: unavailable.]";
	}
	if (utf8ByteLength(marker) > maxBytes) {
		return takeUtf8Prefix(marker, maxBytes);
	}

	const headBudget = Math.min(DEFAULT_BASH_HEAD_BYTES, Math.max(0, maxBytes - utf8ByteLength(marker)));
	const initialHead = takeUtf8Prefix(output, headBudget);
	const tailBudget = Math.max(0, maxBytes - utf8ByteLength(initialHead) - utf8ByteLength(marker));
	const initialTail = takeUtf8Suffix(output, tailBudget);
	const omittedStart = initialHead.length;
	const omittedEnd = output.length - initialTail.length;
	const omitted = omittedEnd > omittedStart ? output.slice(omittedStart, omittedEnd) : "";
	const omittedBytes = Math.max(0, utf8ByteLength(omitted));
	const omittedLines = countLines(omitted);
	marker = `[Pi retained-context compression: omitted ${omittedBytes} bytes / ${omittedLines} lines from bash output. Full output: ${fullOutputPath}.]`;

	let head = initialHead;
	let tail = initialTail;
	let remaining = maxBytes - utf8ByteLength(marker);
	if (remaining < 0) {
		marker = takeUtf8Prefix(marker, maxBytes);
		return marker;
	}
	if (utf8ByteLength(head) > remaining) {
		head = takeUtf8Prefix(head, remaining);
		tail = "";
	} else {
		remaining -= utf8ByteLength(head);
		tail = takeUtf8Suffix(tail, remaining);
	}

	return `${head}${marker}${tail}`;
}

function isPlainRemovableThinking(block: ThinkingContent): boolean {
	return !block.redacted && !block.thinkingSignature;
}

function optimizeAssistantMessage(
	message: AssistantMessage,
	options: RetainedContextOptimizationOptions,
): AssistantMessage | undefined {
	if (!options.stripThinking) return message;
	let changed = false;
	const content = message.content.filter((block) => {
		if (block.type !== "thinking") return true;
		const keep = !isPlainRemovableThinking(block);
		if (!keep) changed = true;
		return keep;
	});
	if (!changed) return message;
	if (
		content.length === 0 &&
		message.stopReason !== "error" &&
		message.stopReason !== "aborted" &&
		!message.responseId &&
		!message.diagnostics?.length
	) {
		return undefined;
	}
	return { ...message, content };
}

function optimizeBashExecutionMessage(
	message: BashExecutionMessage,
	options: RetainedContextOptimizationOptions,
): BashExecutionMessage {
	if (!options.compressBashOutput || !message.output) return message;
	const output = compressBashReplayOutput(message.output, {
		maxBytes: options.bashMaxBytes,
		fullOutputPath: message.fullOutputPath,
	});
	return output === message.output ? message : { ...message, output };
}

function optimizeBashToolResultMessage(
	message: ToolResultMessage,
	options: RetainedContextOptimizationOptions,
): ToolResultMessage {
	if (!options.compressBashOutput || message.toolName !== "bash") return message;
	let changed = false;
	const content = message.content.map((block): TextContent => {
		const text = compressBashReplayOutput(block.text, { maxBytes: options.bashMaxBytes });
		if (text !== block.text) changed = true;
		return text === block.text ? block : { ...block, text };
	});
	return changed ? { ...message, content } : message;
}

function textFromToolResult(message: ToolResultMessage): string {
	return message.content.map((block) => block.text).join("");
}

function isSummaryText(text: string): boolean {
	return text.startsWith(SUMMARY_START) && text.includes(SUMMARY_END);
}

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getToolCallBlocks(message: AssistantMessage, assistantIndex: number): ToolCallMetadata[] {
	return message.content
		.filter((block): block is ToolCall => block.type === "toolCall")
		.filter((block) => typeof block.id === "string" && typeof block.name === "string" && isObject(block.arguments))
		.map((block) => ({
			id: block.id,
			name: block.name,
			arguments: block.arguments,
			assistantIndex,
		}));
}

function canonicalOptionalPositiveInteger(value: unknown): number | null | undefined {
	if (value === undefined) return null;
	if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) return undefined;
	return value;
}

function normalizeToolPath(rawPath: unknown, cwd: string | undefined): string | undefined {
	if (typeof rawPath !== "string" || rawPath.length === 0) return undefined;
	if (!cwd) return normalize(rawPath);
	return normalize(isAbsolute(rawPath) ? rawPath : resolve(cwd, rawPath));
}

function getPathArg(args: Record<string, unknown>): unknown {
	return args.path ?? args.file_path;
}

function getReadKey(call: ToolCallMetadata | undefined, cwd: string | undefined): ReadKey | undefined {
	if (!call || call.name !== "read") return undefined;
	const path = normalizeToolPath(getPathArg(call.arguments), cwd);
	const offset = canonicalOptionalPositiveInteger(call.arguments.offset);
	const limit = canonicalOptionalPositiveInteger(call.arguments.limit);
	if (!path || offset === undefined || limit === undefined) return undefined;
	return { path, offset, limit };
}

function getMutationPath(call: ToolCallMetadata | undefined, cwd: string | undefined): string | undefined {
	if (!call || (call.name !== "edit" && call.name !== "write")) return undefined;
	return normalizeToolPath(getPathArg(call.arguments), cwd);
}

function readKeyToString(key: ReadKey): string {
	return `${key.path}\u0000${key.offset ?? ""}\u0000${key.limit ?? ""}`;
}

function hasLaterAssistant(messages: AgentMessage[], afterIndex: number): boolean {
	return messages.slice(afterIndex + 1).some((message) => message.role === "assistant");
}

function protectedToolResultIndices(messages: AgentMessage[]): Set<number> {
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

	const protectedIndices = new Set<number>();
	const unconsumed = batches.filter((batch) => !batch.consumed).at(-1);
	for (const index of unconsumed?.resultIndices ?? []) protectedIndices.add(index);
	for (const batch of batches.filter((batch) => batch.consumed).slice(-PROTECTED_RECENT_CONSUMED_BATCHES)) {
		for (const index of batch.resultIndices) protectedIndices.add(index);
	}
	return protectedIndices;
}

function collectToolResultRecords(messages: AgentMessage[], cwd: string | undefined): ToolResultRecord[] {
	const callMap = new Map<string, ToolCallMetadata>();
	for (let index = 0; index < messages.length; index++) {
		const message = messages[index];
		if (message.role !== "assistant") continue;
		for (const call of getToolCallBlocks(message, index)) {
			callMap.set(call.id, call);
		}
	}

	const protectedIndices = protectedToolResultIndices(messages);
	const pathSegments = new Map<string, number>();
	const records: ToolResultRecord[] = [];
	for (let index = 0; index < messages.length; index++) {
		const message = messages[index];
		if (message.role !== "toolResult") continue;
		const call = callMap.get(message.toolCallId);
		const text = textFromToolResult(message);
		const readKey = getReadKey(call, cwd);
		const mutationPath = !message.isError ? getMutationPath(call, cwd) : undefined;
		const segment = readKey ? (pathSegments.get(readKey.path) ?? 0) : 0;
		records.push({
			messageIndex: index,
			message,
			call,
			text,
			bytes: utf8ByteLength(text),
			lines: countLines(text),
			sha256: sha256(text),
			alreadySummarized: isSummaryText(text),
			protected: protectedIndices.has(index),
			readKey,
			segment,
		});
		if (mutationPath) {
			pathSegments.set(mutationPath, (pathSegments.get(mutationPath) ?? 0) + 1);
		}
	}
	return records;
}

function markDuplicateReads(records: ToolResultRecord[]): {
	summaries: Map<number, SummaryPolicy>;
	pinnedRaw: Set<number>;
} {
	const summaries = new Map<number, SummaryPolicy>();
	const pinnedRaw = new Set<number>();
	const groups = new Map<string, ToolResultRecord[]>();
	for (const record of records) {
		if (
			record.message.toolName !== "read" ||
			record.message.isError ||
			record.alreadySummarized ||
			!record.readKey ||
			!record.call
		) {
			continue;
		}
		const key = `${readKeyToString(record.readKey)}\u0000${record.segment}\u0000${record.sha256}\u0000${record.bytes}`;
		const group = groups.get(key) ?? [];
		group.push(record);
		groups.set(key, group);
	}

	for (const group of groups.values()) {
		if (group.length < 2) continue;
		const target = group[group.length - 1];
		pinnedRaw.add(target.messageIndex);
		for (const record of group.slice(0, -1)) {
			if (record.protected) continue;
			summaries.set(record.messageIndex, {
				policy: "read_duplicate",
				duplicateOfToolCallId: target.message.toolCallId,
				retainedByPolicy: "newest_duplicate",
			});
		}
	}

	return { summaries, pinnedRaw };
}

function estimateRetainedBytes(record: ToolResultRecord, summaries: Map<number, SummaryPolicy>): number {
	return summaries.has(record.messageIndex) ? 0 : record.bytes;
}

function markStaleBudgetSummaries(
	records: ToolResultRecord[],
	summaries: Map<number, SummaryPolicy>,
	pinnedRaw: Set<number>,
	maxBytes: number,
): void {
	const eligibleTools = new Set(["read", "bash", "edit"]);
	const candidates = records.filter(
		(record) =>
			eligibleTools.has(record.message.toolName) &&
			!record.protected &&
			!record.message.isError &&
			!record.alreadySummarized &&
			!summaries.has(record.messageIndex) &&
			!pinnedRaw.has(record.messageIndex) &&
			record.bytes >= MIN_STALE_TOOL_RESULT_BYTES,
	);
	let retainedBytes = records
		.filter(
			(record) =>
				eligibleTools.has(record.message.toolName) &&
				!record.protected &&
				!record.message.isError &&
				!record.alreadySummarized,
		)
		.reduce((total, record) => total + estimateRetainedBytes(record, summaries), 0);

	for (const record of candidates) {
		if (retainedBytes <= maxBytes) break;
		summaries.set(record.messageIndex, {
			policy: "stale_budget",
			duplicateOfToolCallId: null,
			retainedByPolicy: "tool_result_budget",
		});
		retainedBytes -= record.bytes;
	}
}

function renderSummary(record: ToolResultRecord, policy: SummaryPolicy): string {
	const args = record.call?.arguments;
	const command = typeof args?.command === "string" ? args.command : undefined;
	const summary = {
		commandSha256: command ? sha256(command) : null,
		duplicateOfToolCallId: policy.duplicateOfToolCallId,
		invalidatedByToolCallId: null,
		limit: record.readKey?.limit ?? null,
		offset: record.readKey?.offset ?? null,
		originalBytes: record.bytes,
		originalLines: record.lines,
		originalSha256: record.sha256,
		path: record.readKey?.path ?? null,
		policy: policy.policy,
		retainedByPolicy: policy.retainedByPolicy,
		toolCallId: record.message.toolCallId,
		toolName: record.message.toolName,
	};
	return `${SUMMARY_START}\n${JSON.stringify(summary)}\n${SUMMARY_END}`;
}

function applyToolResultSummaries(
	messages: AgentMessage[],
	records: ToolResultRecord[],
	summaries: Map<number, SummaryPolicy>,
): AgentMessage[] {
	if (summaries.size === 0) return messages;
	const recordByIndex = new Map(records.map((record) => [record.messageIndex, record]));
	let changed = false;
	const optimized = messages.map((message, index): AgentMessage => {
		const policy = summaries.get(index);
		const record = recordByIndex.get(index);
		if (!policy || !record || message.role !== "toolResult") return message;
		changed = true;
		return {
			...message,
			content: [{ type: "text", text: renderSummary(record, policy) }],
		} as AgentMessage;
	});
	return changed ? optimized : messages;
}

function optimizeToolResultReplay(
	messages: AgentMessage[],
	options: RetainedContextOptimizationOptions,
): AgentMessage[] {
	if (!options.dedupeReadResults && !options.summarizeStaleToolResults) return messages;
	const records = collectToolResultRecords(messages, options.cwd);
	if (records.length === 0) return messages;
	const summaries = new Map<number, SummaryPolicy>();
	const pinnedRaw = new Set<number>();
	if (options.dedupeReadResults) {
		const duplicatePlan = markDuplicateReads(records);
		for (const [index, policy] of duplicatePlan.summaries) summaries.set(index, policy);
		for (const index of duplicatePlan.pinnedRaw) pinnedRaw.add(index);
	}
	if (options.summarizeStaleToolResults) {
		markStaleBudgetSummaries(records, summaries, pinnedRaw, options.toolResultMaxBytes);
	}
	return applyToolResultSummaries(messages, records, summaries);
}

export function optimizeRetainedContext(
	messages: AgentMessage[],
	options: RetainedContextOptimizationOptions,
): AgentMessage[] {
	if (
		!options.stripThinking &&
		!options.compressBashOutput &&
		!options.dedupeReadResults &&
		!options.summarizeStaleToolResults
	) {
		return messages;
	}
	let changed = false;
	const optimized: AgentMessage[] = [];
	for (const message of messages) {
		let next: AgentMessage | undefined = message;
		if (message.role === "assistant") {
			next = optimizeAssistantMessage(message, options) as AgentMessage | undefined;
		} else if (message.role === "bashExecution") {
			next = optimizeBashExecutionMessage(message, options) as AgentMessage;
		} else if (message.role === "toolResult") {
			next = optimizeBashToolResultMessage(message, options) as AgentMessage;
		}
		if (!next) {
			changed = true;
			continue;
		}
		if (next !== message) changed = true;
		optimized.push(next);
	}
	const withToolSummaries = optimizeToolResultReplay(optimized, options);
	if (withToolSummaries !== optimized) changed = true;
	return changed ? withToolSummaries : messages;
}
