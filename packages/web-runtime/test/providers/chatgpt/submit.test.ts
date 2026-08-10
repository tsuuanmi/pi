import { describe, expect, test } from "vitest";
import { submissionEvidence } from "../../../src/providers/chatgpt/submit.ts";

describe("ChatGPT submission evidence", () => {
	const initial = {
		initialUserTurns: 1,
		userTurns: 1,
		initialAssistantTurns: 1,
		assistantTurns: 1,
		running: false,
	};

	test("accepts only observable turn state changes", () => {
		expect(submissionEvidence(initial)).toBeUndefined();
		expect(submissionEvidence({ ...initial, userTurns: 2 })).toBe("user-turn");
		expect(submissionEvidence({ ...initial, assistantTurns: 2 })).toBe("assistant-turn");
		expect(submissionEvidence({ ...initial, running: true })).toBe("generation-running");
	});
});
