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

	it("ignores Pi tool declarations and tool choice", () => {
		const input = request({ pi_caller: { session_id: "pi-session-fixture" } });
		input.tools = [{ type: "function", name: "search" }];
		input.tool_choice = "auto";
		expect(parseGeminiWebRequest(input).context.messages).toHaveLength(1);
	});

	it("maps the single enabled reasoning option to the browser request", () => {
		const input = request({ pi_caller: { session_id: "pi-session-fixture" } });
		input.reasoning = { effort: "high" };
		expect(parseGeminiWebRequest(input).options.reasoning).toBe("high");
	});

	it("keeps the base model selected when reasoning is off", () => {
		const input = request({ pi_caller: { session_id: "pi-session-fixture" } });
		input.reasoning = { effort: "none" };
		expect(parseGeminiWebRequest(input).options.reasoning).toBeUndefined();
	});

	it("rejects requests without a Pi session before browser acquisition", () => {
		expect(() => parseGeminiWebRequest(request())).toThrow("Pi session identity");
	});
});
