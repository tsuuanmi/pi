import {
	createSlidingWindowContextTransform,
	groupMessagesIntoTurns,
	type Message,
	pruneMessagesByTurns,
} from "@tsuuanmi/pi-agent";
import { describe, expect, test } from "vitest";

const timestamp = 1;
const usage = {
	input: 1,
	output: 1,
	totalTokens: 2,
	cacheRead: 0,
	cacheWrite: 0,
	cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};

function user(text: string): Message {
	return { role: "user", content: [{ type: "text", text }], timestamp };
}

function assistant(text: string): Message {
	return {
		role: "assistant",
		content: [{ type: "text", text }],
		api: "test",
		provider: "test",
		model: "test-model",
		usage,
		stopReason: "stop",
		timestamp,
	};
}

function assistantToolCall(id: string): Message {
	return {
		role: "assistant",
		content: [{ type: "toolCall", id, name: "lookup", arguments: { value: id } }],
		api: "test",
		provider: "test",
		model: "test-model",
		usage,
		stopReason: "toolUse",
		timestamp,
	};
}

function toolResult(id: string): Message {
	return {
		role: "toolResult",
		toolCallId: id,
		toolName: "lookup",
		content: [{ type: "text", text: `result ${id}` }],
		details: {},
		isError: false,
		timestamp,
	};
}

describe("context pruning", () => {
	test("groups assistant tool calls with matching tool results", () => {
		const turns = groupMessagesIntoTurns([
			user("one"),
			assistantToolCall("call-1"),
			toolResult("call-1"),
			assistant("two"),
		]);

		expect(turns).toHaveLength(2);
		expect(turns[0]?.messages.map((message) => message.role)).toEqual(["user", "assistant", "toolResult"]);
		expect(turns[0]?.toolCallIds).toEqual(["call-1"]);
		expect(turns[0]?.toolResultIds).toEqual(["call-1"]);
		expect(turns[0]?.hasCompleteToolResults).toBe(true);
		expect(turns[1]?.messages.map((message) => message.role)).toEqual(["assistant"]);
	});

	test("prunes by newest assistant turns without orphaning tool results", () => {
		const messages = [
			user("old"),
			assistantToolCall("old-call"),
			toolResult("old-call"),
			assistant("middle"),
			user("new"),
			assistantToolCall("new-call"),
			toolResult("new-call"),
		];

		const pruned = pruneMessagesByTurns(messages, 1);

		expect(pruned.map((message) => message.role)).toEqual(["user", "assistant", "toolResult"]);
		expect(pruned[0]).toMatchObject({ role: "user" });
		expect(pruned[1]).toMatchObject({ role: "assistant" });
		expect(pruned[2]).toMatchObject({ role: "toolResult", toolCallId: "new-call" });
	});

	test("drops orphan tool results at the pruning boundary", () => {
		const messages = [toolResult("orphan"), user("new"), assistant("answer")];

		expect(pruneMessagesByTurns(messages, 1).map((message) => message.role)).toEqual(["user", "assistant"]);
	});

	test("creates a transformContext sliding window", async () => {
		const transform = createSlidingWindowContextTransform({ maxTurns: 1 });
		const pruned = await transform([user("old"), assistant("old answer"), user("new"), assistant("new answer")]);

		expect(pruned).toHaveLength(2);
		expect(pruned[0]).toMatchObject({ role: "user" });
		expect(pruned[1]).toMatchObject({ role: "assistant" });
	});
});
