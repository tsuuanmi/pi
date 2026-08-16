import {
	acknowledgedConversationCheckpoint,
	canonicalConversationEvents,
	conversationSuffix,
} from "../../vendor/runtime/src/adapters/chatgpt-web/conversation/conversation-sync.js";

const authority = "authority";

describe("durable conversation synchronization", () => {
	it("creates a genesis batch and appends only after the acknowledged assistant", () => {
		const first = canonicalConversationEvents([{ type: "message", role: "user", content: "question" }]);
		const checkpoint = acknowledgedConversationCheckpoint(first, authority, { ordinal: 1, text: "answer" });
		const next = canonicalConversationEvents([
			{ type: "message", role: "user", content: "question" },
			{ type: "message", role: "assistant", content: "answer" },
			{ type: "message", role: "user", content: "follow-up" },
		]);
		const suffix = conversationSuffix(next, authority, checkpoint);
		expect(suffix.kind).toBe("append");
		if (suffix.kind === "append") expect(suffix.events.map((event) => event.ordinal)).toEqual([2]);
	});

	it("continues a third turn after commentary, reasoning, and final-answer phases", () => {
		const prior = canonicalConversationEvents([
			{ type: "message", role: "developer", content: "instructions" },
			{ type: "message", role: "user", content: "first question" },
			{ type: "message", role: "assistant", content: "first answer" },
			{ type: "message", role: "user", content: "second question" },
		]);
		const checkpoint = acknowledgedConversationCheckpoint(prior, authority, { ordinal: 4, text: "second answer" });
		const third = canonicalConversationEvents([
			{ type: "message", role: "developer", content: "instructions" },
			{ type: "message", role: "user", content: "first question" },
			{ type: "message", role: "assistant", content: "first answer" },
			{ type: "message", role: "user", content: "second question" },
			{ type: "message", role: "assistant", phase: "commentary", content: "working" },
			{ type: "message", role: "assistant", content: [{ type: "thinking", thinking: "searching" }] },
			{ type: "message", role: "assistant", phase: "final_answer", content: "second answer" },
			{ type: "message", role: "user", content: "third question" },
		]);
		const suffix = conversationSuffix(third, authority, checkpoint);
		expect(suffix.kind).toBe("append");
		if (suffix.kind === "append") expect(suffix.events.map((event) => event.ordinal)).toEqual([7]);
	});

	it("keeps request-only environment blocks and generated user ids out of persistent identity", () => {
		const first = canonicalConversationEvents([
			{
				type: "message",
				role: "user",
				content: "<environment_context>one</environment_context>",
			},
			{ id: "user_turn1", type: "message", role: "user", content: "question" },
		]);
		const checkpoint = acknowledgedConversationCheckpoint(first, authority, { ordinal: 1, text: "answer" });
		const next = canonicalConversationEvents([
			{ type: "message", role: "user", content: "question" },
			{ type: "message", role: "assistant", content: "answer" },
			{
				type: "message",
				role: "user",
				content: [{ type: "text", text: "<environment_context>two</environment_context>" }],
			},
			{ id: "user_turn2", type: "message", role: "user", content: "follow-up" },
		]);
		const suffix = conversationSuffix(next, authority, checkpoint);
		expect(suffix.kind).toBe("append");
		if (suffix.kind === "append") expect(suffix.events.map((event) => event.sourceIndex)).toEqual([3]);
	});

	it("recognizes exact retries and ignores parser timestamps", () => {
		const first = canonicalConversationEvents([
			{ type: "message", role: "user", content: "question", timestamp: "2026-01-01T00:00:00Z" },
		]);
		const checkpoint = acknowledgedConversationCheckpoint(first, authority, { ordinal: 1, text: "answer" });
		const retry = canonicalConversationEvents([
			{ type: "message", role: "user", content: "question", timestamp: "2026-02-01T00:00:00Z" },
			{ type: "message", role: "assistant", content: "answer", timestamp: "2026-02-01T00:00:01Z" },
		]);
		expect(conversationSuffix(retry, authority, checkpoint).kind).toBe("retry");
	});

	it("rejects authority changes, rewinds, edited prefixes, and changed assistant output", () => {
		const first = canonicalConversationEvents([{ type: "message", role: "user", content: "question" }]);
		const checkpoint = acknowledgedConversationCheckpoint(first, authority, { ordinal: 1, text: "answer" });
		expect(conversationSuffix([], authority, checkpoint).kind).toBe("diverged");
		expect(conversationSuffix(first, "changed-authority", checkpoint).kind).toBe("diverged");
		expect(
			conversationSuffix(
				canonicalConversationEvents([
					{ type: "message", role: "user", content: "edited" },
					{ type: "message", role: "assistant", content: "answer" },
				]),
				authority,
				checkpoint,
			).kind,
		).toBe("diverged");
		expect(
			conversationSuffix(
				canonicalConversationEvents([
					{ type: "message", role: "user", content: "question" },
					{ type: "message", role: "assistant", content: "different" },
				]),
				authority,
				checkpoint,
			).kind,
		).toBe("diverged");
	});
});
