import { parseChatGptWireResponse } from "#internet-vendor/adapters/chatgpt-web/wire-response";

describe("ChatGPT wire response capture", () => {
	it("selects the final assistant message from conversation SSE", () => {
		const body = [
			'data: {"message":{"author":{"role":"assistant"},"content":{"parts":["partial"]}}}',
			'data: {"message":{"author":{"role":"assistant"},"content":{"parts":["final answer"]}}}',
			"data: [DONE]",
		].join("\n\n");
		expect(parseChatGptWireResponse(body)).toBe("final answer");
	});

	it("assembles content-scoped append events", () => {
		const body = [
			'data: {"o":"append","p":"/message/content/parts/0","v":"final "}',
			'data: {"o":"append","p":"/message/content/parts/0","v":"answer"}',
		].join("\n\n");
		expect(parseChatGptWireResponse(body)).toBe("final answer");
	});

	it("ignores non-assistant payloads and malformed events", () => {
		const body = ['data: {"message":{"author":{"role":"user"},"content":{"parts":["prompt"]}}}', "data: nope"].join(
			"\n\n",
		);
		expect(parseChatGptWireResponse(body)).toBeUndefined();
	});
});
