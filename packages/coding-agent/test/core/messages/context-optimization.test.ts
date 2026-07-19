import type { AgentMessage, BashExecutionMessage } from "@tsuuanmi/pi-agent";
import type { AssistantMessage, ToolResultMessage } from "@tsuuanmi/pi-ai";
import { describe, expect, it } from "vitest";
import { compressBashReplayOutput, optimizeRetainedContext } from "#coding-agent/sdk/context-optimization";

const usage: AssistantMessage["usage"] = {
	input: 0,
	output: 0,
	cacheRead: 0,
	cacheWrite: 0,
	totalTokens: 0,
	cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};

const defaultOptions = {
	stripThinking: false,
	compressBashOutput: false,
	bashMaxBytes: 16_384,
	dedupeReadResults: true,
	summarizeStaleToolResults: true,
	toolResultMaxBytes: 96_000,
	cwd: "/repo",
};

function assistant(content: AssistantMessage["content"]): AssistantMessage {
	return {
		role: "assistant",
		content,
		api: "openai-completions",
		provider: "test",
		model: "test",
		usage,
		stopReason: "stop",
		timestamp: 1,
	};
}

function textAssistant(text = "ok"): AssistantMessage {
	return assistant([{ type: "text", text }]);
}

function toolCall(id: string, name: string, args: Record<string, unknown>): AssistantMessage {
	return assistant([{ type: "toolCall", id, name, arguments: args }]);
}

function toolResult(
	toolCallId: string,
	toolName: string,
	text: string,
	options: { isError?: boolean; timestamp?: number } = {},
): ToolResultMessage {
	return {
		role: "toolResult",
		toolCallId,
		toolName,
		content: [{ type: "text", text }],
		isError: options.isError ?? false,
		timestamp: options.timestamp ?? 1,
	};
}

function consumedToolBatch(id: string, name: string, args: Record<string, unknown>, text: string): AgentMessage[] {
	return [toolCall(id, name, args), toolResult(id, name, text), textAssistant(`consumed ${id}`)];
}

function protectionFillers(): AgentMessage[] {
	return [
		...consumedToolBatch("call_filler_1", "read", { path: "f1.ts" }, "filler 1"),
		...consumedToolBatch("call_filler_2", "read", { path: "f2.ts" }, "filler 2"),
	];
}

function textOf(message: AgentMessage): string {
	expect(message.role).toBe("toolResult");
	return (message as ToolResultMessage).content.map((block) => block.text).join("");
}

function expectSummary(text: string): Record<string, unknown> {
	expect(text).toContain("[Pi retained tool-result summary v1]");
	const json = text.split("\n")[1];
	return JSON.parse(json) as Record<string, unknown>;
}

describe("retained context optimization", () => {
	it("removes plain readable thinking without mutating the original message", () => {
		const message = assistant([
			{ type: "thinking", thinking: "private reasoning" },
			{ type: "text", text: "answer" },
			{ type: "toolCall", id: "call_1", name: "read", arguments: { path: "a.ts" } },
		]);
		const originalContent = message.content;

		const optimized = optimizeRetainedContext([message], {
			...defaultOptions,
			stripThinking: true,
			dedupeReadResults: false,
			summarizeStaleToolResults: false,
		});

		expect(optimized[0]).not.toBe(message);
		expect(message.content).toBe(originalContent);
		expect(message.content).toHaveLength(3);
		expect((optimized[0] as AssistantMessage).content).toEqual([
			{ type: "text", text: "answer" },
			{ type: "toolCall", id: "call_1", name: "read", arguments: { path: "a.ts" } },
		]);
	});

	it("preserves signed and redacted thinking blocks", () => {
		const message = assistant([
			{ type: "thinking", thinking: "signed", thinkingSignature: "sig" },
			{ type: "thinking", thinking: "redacted", thinkingSignature: "opaque", redacted: true },
		]);

		const optimized = optimizeRetainedContext([message], {
			...defaultOptions,
			stripThinking: true,
			dedupeReadResults: false,
			summarizeStaleToolResults: false,
		});

		expect(optimized).toHaveLength(1);
		expect(optimized[0]).toBe(message);
	});

	it("drops assistant messages that only contain removable thinking", () => {
		const message = assistant([{ type: "thinking", thinking: "remove" }]);

		const optimized = optimizeRetainedContext([message], {
			...defaultOptions,
			stripThinking: true,
			dedupeReadResults: false,
			summarizeStaleToolResults: false,
		});

		expect(optimized).toEqual([]);
	});

	it("compresses bash execution output in replay copies only", () => {
		const output = `${"a".repeat(10_000)}\nMIDDLE\n${"z".repeat(10_000)}`;
		const message: BashExecutionMessage = {
			role: "bashExecution",
			command: "npm run check",
			output,
			exitCode: 0,
			cancelled: false,
			truncated: false,
			fullOutputPath: "/tmp/full-output.log",
			timestamp: 1,
		};

		const optimized = optimizeRetainedContext([message], {
			...defaultOptions,
			compressBashOutput: true,
			bashMaxBytes: 4096,
			dedupeReadResults: false,
			summarizeStaleToolResults: false,
		});

		const optimizedMessage = optimized[0] as BashExecutionMessage;
		expect(message.output).toBe(output);
		expect(optimizedMessage.output).not.toBe(output);
		expect(Buffer.byteLength(optimizedMessage.output, "utf8")).toBeLessThanOrEqual(4096);
		expect(optimizedMessage.output).toContain("Pi retained-context compression");
		expect(optimizedMessage.output).toContain("/tmp/full-output.log");
	});

	it("compresses bash tool result text and preserves IDs/metadata", () => {
		const message: AgentMessage = toolResult("call_bash", "bash", "x".repeat(10_000));

		const optimized = optimizeRetainedContext([message], {
			...defaultOptions,
			compressBashOutput: true,
			bashMaxBytes: 2048,
			dedupeReadResults: false,
			summarizeStaleToolResults: false,
		});

		const optimizedMessage = optimized[0] as Extract<AgentMessage, { role: "toolResult" }>;
		expect(optimizedMessage).toMatchObject({ role: "toolResult", toolCallId: "call_bash", toolName: "bash" });
		expect(Buffer.byteLength(optimizedMessage.content[0].text, "utf8")).toBeLessThanOrEqual(2048);
	});

	it("leaves non-bash tool results unchanged when Tier 2 is disabled", () => {
		const message: AgentMessage = toolResult("call_read", "read", "x".repeat(10_000));

		const optimized = optimizeRetainedContext([message], {
			...defaultOptions,
			compressBashOutput: true,
			bashMaxBytes: 2048,
			dedupeReadResults: false,
			summarizeStaleToolResults: false,
		});

		expect(optimized).toHaveLength(1);
		expect(optimized[0]).toBe(message);
	});

	it("respects utf8 byte budgets with multibyte characters", () => {
		const output = `${"é".repeat(5000)}\n${"界".repeat(5000)}`;
		const compressed = compressBashReplayOutput(output, { maxBytes: 3000 });

		expect(Buffer.byteLength(compressed, "utf8")).toBeLessThanOrEqual(3000);
		expect(() => Buffer.from(compressed, "utf8").toString("utf8")).not.toThrow();
	});

	it("summarizes older duplicate reads only when key and content identity match", () => {
		const messages: AgentMessage[] = [
			...consumedToolBatch("call_old", "read", { path: "src/a.ts" }, "same content"),
			...consumedToolBatch("call_new", "read", { path: "src/a.ts" }, "same content"),
			...protectionFillers(),
		];

		const optimized = optimizeRetainedContext(messages, defaultOptions);
		const oldSummary = expectSummary(textOf(optimized[1]));

		expect(oldSummary.policy).toBe("read_duplicate");
		expect(oldSummary.duplicateOfToolCallId).toBe("call_new");
		expect(oldSummary.originalBytes).toBe(Buffer.byteLength("same content", "utf8"));
		expect(textOf(optimized[4])).toBe("same content");
	});

	it("does not dedupe same read key with different content", () => {
		const messages: AgentMessage[] = [
			...consumedToolBatch("call_old", "read", { path: "src/a.ts" }, "old content"),
			...consumedToolBatch("call_new", "read", { path: "src/a.ts" }, "new content"),
			...protectionFillers(),
		];

		const optimized = optimizeRetainedContext(messages, defaultOptions);

		expect(textOf(optimized[1])).toBe("old content");
		expect(textOf(optimized[4])).toBe("new content");
	});

	it("does not let bash between different read outputs cause unsafe dedupe", () => {
		const messages: AgentMessage[] = [
			...consumedToolBatch("call_old", "read", { path: "src/a.ts" }, "old content"),
			...consumedToolBatch("call_bash", "bash", { command: "printf change > src/a.ts" }, "changed"),
			...consumedToolBatch("call_new", "read", { path: "src/a.ts" }, "new content"),
			...protectionFillers(),
		];

		const optimized = optimizeRetainedContext(messages, defaultOptions);

		expect(textOf(optimized[1])).toBe("old content");
		expect(textOf(optimized[7])).toBe("new content");
	});

	it("allows identical read output after an intervening bash command", () => {
		const messages: AgentMessage[] = [
			...consumedToolBatch("call_old", "read", { path: "src/a.ts" }, "same content"),
			...consumedToolBatch("call_bash", "bash", { command: "true" }, "ok"),
			...consumedToolBatch("call_new", "read", { path: "src/a.ts" }, "same content"),
			...protectionFillers(),
		];

		const optimized = optimizeRetainedContext(messages, defaultOptions);
		const oldSummary = expectSummary(textOf(optimized[1]));

		expect(oldSummary.policy).toBe("read_duplicate");
		expect(oldSummary.duplicateOfToolCallId).toBe("call_new");
		expect(textOf(optimized[7])).toBe("same content");
	});

	it("does not dedupe across successful edit invalidation", () => {
		const messages: AgentMessage[] = [
			...consumedToolBatch("call_old", "read", { path: "src/a.ts" }, "same content"),
			...consumedToolBatch("call_edit", "edit", { path: "src/a.ts", edits: [] }, "Successfully replaced 1 block"),
			...consumedToolBatch("call_new", "read", { path: "src/a.ts" }, "same content"),
			...protectionFillers(),
		];

		const optimized = optimizeRetainedContext(messages, defaultOptions);

		expect(textOf(optimized[1])).toBe("same content");
		expect(textOf(optimized[7])).toBe("same content");
	});

	it("failed edit does not invalidate identical read dedupe", () => {
		const messages: AgentMessage[] = [
			...consumedToolBatch("call_old", "read", { path: "src/a.ts" }, "same content"),
			toolCall("call_edit", "edit", { path: "src/a.ts", edits: [] }),
			toolResult("call_edit", "edit", "edit failed", { isError: true }),
			textAssistant("consumed edit"),
			...consumedToolBatch("call_new", "read", { path: "src/a.ts" }, "same content"),
			...protectionFillers(),
		];

		const optimized = optimizeRetainedContext(messages, defaultOptions);
		const oldSummary = expectSummary(textOf(optimized[1]));

		expect(oldSummary.duplicateOfToolCallId).toBe("call_new");
	});

	it("keeps error tool results raw", () => {
		const messages: AgentMessage[] = [
			...consumedToolBatch("call_old", "read", { path: "src/a.ts" }, "same content"),
			toolCall("call_error", "read", { path: "src/a.ts" }),
			toolResult("call_error", "read", "read failed", { isError: true }),
			textAssistant("consumed error"),
			...protectionFillers(),
		];

		const optimized = optimizeRetainedContext(messages, { ...defaultOptions, toolResultMaxBytes: 1 });

		expect(textOf(optimized[4])).toBe("read failed");
	});

	it("fails open for malformed read args", () => {
		const messages: AgentMessage[] = [
			...consumedToolBatch("call_old", "read", { path: "src/a.ts", offset: null }, "same content"),
			...consumedToolBatch("call_new", "read", { path: "src/a.ts", offset: null }, "same content"),
			...protectionFillers(),
		];

		const optimized = optimizeRetainedContext(messages, defaultOptions);

		expect(textOf(optimized[1])).toBe("same content");
	});

	it("does not treat a user message after a tool result as consumed", () => {
		const messages: AgentMessage[] = [
			toolCall("call_current", "read", { path: "src/current.ts" }),
			toolResult("call_current", "read", "x".repeat(3000)),
			{ role: "user", content: "next", timestamp: 1 },
		];

		const optimized = optimizeRetainedContext(messages, { ...defaultOptions, toolResultMaxBytes: 1 });

		expect(textOf(optimized[1])).toBe("x".repeat(3000));
	});

	it("applies stale budget summaries only to old unprotected eligible bytes", () => {
		const large = "x".repeat(3000);
		const messages: AgentMessage[] = [
			...consumedToolBatch("call_old_read", "read", { path: "old.ts" }, large),
			...consumedToolBatch("call_old_bash", "bash", { command: "yes" }, large),
			...consumedToolBatch("call_recent_1", "read", { path: "recent1.ts" }, large),
			...consumedToolBatch("call_recent_2", "edit", { path: "recent2.ts", edits: [] }, large),
		];

		const optimized = optimizeRetainedContext(messages, { ...defaultOptions, toolResultMaxBytes: 1000 });

		expect(expectSummary(textOf(optimized[1])).policy).toBe("stale_budget");
		expect(expectSummary(textOf(optimized[4])).policy).toBe("stale_budget");
		expect(textOf(optimized[7])).toBe(large);
		expect(textOf(optimized[10])).toBe(large);
	});

	it("preserves multi-tool-call ordering, outer metadata, idempotence, and raw duplicate targets", () => {
		const messages: AgentMessage[] = [
			assistant([
				{ type: "toolCall", id: "call_old", name: "read", arguments: { path: "src/a.ts" } },
				{ type: "toolCall", id: "call_other", name: "bash", arguments: { command: "pwd" } },
			]),
			{ ...toolResult("call_old", "read", "same content"), details: { retained: true } },
			toolResult("call_other", "bash", "ok"),
			textAssistant("consumed"),
			...consumedToolBatch("call_new", "read", { path: "src/a.ts" }, "same content"),
			...protectionFillers(),
		];

		const optimized = optimizeRetainedContext(messages, defaultOptions);
		const optimizedAgain = optimizeRetainedContext(optimized, defaultOptions);
		const oldResult = optimized[1] as ToolResultMessage;
		const summary = expectSummary(textOf(oldResult));

		expect(optimizedAgain).toEqual(optimized);
		expect(oldResult.toolCallId).toBe("call_old");
		expect(oldResult.toolName).toBe("read");
		expect(oldResult.details).toEqual({ retained: true });
		expect(summary.duplicateOfToolCallId).toBe("call_new");
		expect(textOf(optimized[5])).toBe("same content");
		expect(textOf(messages[1])).toBe("same content");
	});

	it("respects Tier 2 opt-outs", () => {
		const messages: AgentMessage[] = [
			...consumedToolBatch("call_old", "read", { path: "src/a.ts" }, "same content"),
			...consumedToolBatch("call_new", "read", { path: "src/a.ts" }, "same content"),
			...protectionFillers(),
		];

		const optimized = optimizeRetainedContext(messages, {
			...defaultOptions,
			dedupeReadResults: false,
			summarizeStaleToolResults: false,
			toolResultMaxBytes: 1,
		});

		expect(optimized).toBe(messages);
	});
});
