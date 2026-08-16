import { validateConversationCanary } from "../../vendor/runtime/src/adapters/chatgpt-web/conversation/conversation-canary.js";

describe("durable conversation canary", () => {
	it("accepts model reply variance when a durable conversation was created", () => {
		expect(
			validateConversationCanary(
				"Confirmed: PI_DURABLE_CONVERSATION_CANARY_OK. The conversation is ready.",
				"https://chatgpt.com/c/canary_123",
			),
		).toBe("https://chatgpt.com/c/canary_123");
	});

	it("requires a completed reply and canonical ChatGPT conversation URL", () => {
		expect(() => validateConversationCanary("  ", "https://chatgpt.com/c/canary_123")).toThrow("empty response");
		expect(() => validateConversationCanary("ready", "https://chatgpt.com/c/WEB:sample")).toThrow(
			"Invalid ChatGPT conversation URL",
		);
	});
});
