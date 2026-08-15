import { isChatGptSearchToolPayload } from "#internet-vendor/adapters/chatgpt-web/tool-payload";

describe("ChatGPT tool payload classification", () => {
	it("recognizes intermediate search payloads", () => {
		expect(
			isChatGptSearchToolPayload(
				JSON.stringify({
					system1_search_query: [{ q: "Google products" }],
					response_length: "short",
				}),
			),
		).toBe(true);
	});

	it("does not classify ordinary JSON answers or malformed text", () => {
		expect(
			isChatGptSearchToolPayload(
				JSON.stringify({
					answer: "final answer",
					response_length: "short",
				}),
			),
		).toBe(false);
		expect(isChatGptSearchToolPayload("not JSON")).toBe(false);
	});
});
