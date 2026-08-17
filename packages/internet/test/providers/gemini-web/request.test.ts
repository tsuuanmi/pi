import { parseGeminiWebRequest } from "#runtime/providers/gemini-web/request";

function request(metadata?: unknown): Record<string, unknown> {
	return {
		model: "gemini-web/flash",
		input: [{ role: "user", content: [{ type: "input_text", text: "Hello" }] }],
		stream: true,
		metadata,
	};
}

describe("Gemini Web request parsing", () => {
	it("binds the browser conversation to the Pi session identity", () => {
		const parsed = parseGeminiWebRequest(
			request({
				pi_caller: { session_id: "pi-session-fixture", turn_id: "pi-turn-fixture" },
			}),
		);
		expect(parsed.sessionId).toBe("pi-session-fixture");
		expect(parsed.context.messages).toHaveLength(1);
	});

	it("rejects requests without a Pi session before browser acquisition", () => {
		expect(() => parseGeminiWebRequest(request())).toThrow("Pi session identity");
	});
});
