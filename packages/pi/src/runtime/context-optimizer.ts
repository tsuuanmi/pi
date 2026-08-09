import type { BashExecutionMessage, Message } from "@tsuuanmi/pi-agent";
import type { AssistantMessage, TextContent, ThinkingContent, ToolResultMessage } from "@tsuuanmi/pi-ai";
import { compressBashOutput } from "#pi/runtime/bash-output";
import { optimizeToolResults, type SummaryLedger, type ToolResultOptions } from "#pi/runtime/tool-results";

export interface ContextOptions extends ToolResultOptions {
	stripThinking: boolean;
	compressBashOutput: boolean;
	bashMaxBytes: number;
}

function removableThinking(block: ThinkingContent): boolean {
	return !block.redacted && !block.thinkingSignature;
}

function optimizeAgent(message: AssistantMessage, options: ContextOptions): AssistantMessage | undefined {
	if (!options.stripThinking) return message;
	let changed = false;
	const content = message.content.filter((block) => {
		if (block.type !== "thinking") return true;
		const keep = !removableThinking(block);
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

function optimizeBashExecution(message: BashExecutionMessage, options: ContextOptions): BashExecutionMessage {
	if (!options.compressBashOutput || !message.output) return message;
	const output = compressBashOutput(message.output, {
		maxBytes: options.bashMaxBytes,
		fullOutputPath: message.fullOutputPath,
	});
	return output === message.output ? message : { ...message, output };
}

function optimizeBashResult(message: ToolResultMessage, options: ContextOptions): ToolResultMessage {
	if (!options.compressBashOutput || message.toolName !== "bash") return message;
	let changed = false;
	const content = message.content.map((block): TextContent => {
		const text = compressBashOutput(block.text, { maxBytes: options.bashMaxBytes });
		if (text !== block.text) changed = true;
		return text === block.text ? block : { ...block, text };
	});
	return changed ? { ...message, content } : message;
}

function optionsKey(options: ContextOptions): string {
	return [
		options.stripThinking,
		options.compressBashOutput,
		options.bashMaxBytes,
		options.dedupeReadResults,
		options.summarizeStaleToolResults,
		options.toolResultMaxBytes,
		options.cwd ?? "",
	].join("\u0000");
}

function appendOnly(previous: Message[] | undefined, next: Message[]): boolean {
	if (!previous || next.length < previous.length) return false;
	return previous.every((message, index) => next[index] === message);
}

export class ContextOptimizer {
	private previousMessages: Message[] | undefined;
	private previousOptionsKey: string | undefined;
	private readonly ledger: SummaryLedger = new Map();

	optimize(messages: Message[], options: ContextOptions): Message[] {
		const key = optionsKey(options);
		if (this.previousOptionsKey !== key || !appendOnly(this.previousMessages, messages)) {
			this.ledger.clear();
		}

		let changed = false;
		const optimized: Message[] = [];
		for (const message of messages) {
			let next: Message | undefined = message;
			if (message.role === "assistant") {
				next = optimizeAgent(message, options) as Message | undefined;
			} else if (message.role === "bashExecution") {
				next = optimizeBashExecution(message, options);
			} else if (message.role === "toolResult") {
				next = optimizeBashResult(message, options);
			}
			if (!next) {
				changed = true;
				continue;
			}
			if (next !== message) changed = true;
			optimized.push(next);
		}

		const result = optimizeToolResults(optimized, options, this.ledger);
		if (result !== optimized) changed = true;
		this.previousMessages = messages.slice();
		this.previousOptionsKey = key;
		return changed ? result : messages;
	}
}
