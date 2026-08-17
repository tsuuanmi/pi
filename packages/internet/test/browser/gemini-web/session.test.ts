import { GEMINI_HOME_URL, parseGeminiConversationUrl } from "#runtime/browser/gemini-web/session";

describe("Gemini navigation", () => {
	it("accepts only the verified home and lowercase alphanumeric conversation URLs", () => {
		expect(GEMINI_HOME_URL).toBe("https://gemini.google.com/app");
		expect(parseGeminiConversationUrl("https://gemini.google.com/app/abc123")).toBe(
			"https://gemini.google.com/app/abc123",
		);
	});

	it("rejects unsafe conversation URLs and IDs", () => {
		expect(parseGeminiConversationUrl("https://gemini.google.com/app?redirect=https://example.com")).toBeUndefined();
		expect(parseGeminiConversationUrl("https://gemini.google.com/app/ABC123")).toBeUndefined();
		expect(parseGeminiConversationUrl("https://example.com/app/abc123")).toBeUndefined();
		expect(parseGeminiConversationUrl("https://gemini.google.com/app/abc-123")).toBeUndefined();
	});
});
