import type { ParsedRequest } from "#runtime/core/protocol/types";
import {
	compileGeminiWebContinuationPrompt,
	compileGeminiWebPrompt,
	validateGeminiWebRequest,
} from "#runtime/providers/gemini-web/prompt";

function request(overrides: Record<string, unknown> = {}): ParsedRequest {
	return {
		modelId: "gemini-web/flash",
		options: {},
		context: {
			systemPrompt: ["Be concise."],
			messages: [{ role: "user", content: "Hello Gemini" }],
		},
		...overrides,
	} as unknown as ParsedRequest;
}

describe("Gemini Web prompt compilation", () => {
	it("compiles normalized text messages with role boundaries", () => {
		const prompt = compileGeminiWebPrompt(request());
		expect(prompt.text).toContain("<system>\nBe concise.\n</system>");
		expect(prompt.text).toContain("<user>\nHello Gemini\n</user>");
	});

	it("sends only the current user message to an existing native chat", () => {
		const prompt = compileGeminiWebContinuationPrompt(
			request({
				context: {
					systemPrompt: ["Be concise."],
					messages: [
						{ role: "user", content: "Earlier question" },
						{ role: "assistant", content: [{ type: "text", text: "Earlier answer" }] },
						{ role: "user", content: "Current question" },
					],
				},
			}),
		);
		expect(prompt.text).toBe("Current question");
	});

	it.each([
		[{ responseFormat: { type: "json_schema" } }, "structured output"],
		[{ opaquePayload: { bytes: "fixture" } }, "opaque request payloads"],
		[{ context: { messages: [], files: [{ name: "fixture.txt" }] } }, "images or files"],
	])("rejects unsupported browser payloads before browser acquisition", (overrides, message) => {
		expect(() => validateGeminiWebRequest(request(overrides))).toThrow(message);
	});

	it("ignores tool declarations while preserving the text-only prompt", () => {
		expect(() =>
			validateGeminiWebRequest(
				request({
					context: { messages: [{ role: "user", content: "Hello" }], tools: [{ name: "search" }] },
					options: { toolChoice: "auto" },
				}),
			),
		).not.toThrow();
	});

	it("accepts the supported reasoning option", () => {
		expect(() => validateGeminiWebRequest(request({ options: { reasoning: "high" } }))).not.toThrow();
	});

	it("rejects image content even when it is embedded in a message", () => {
		expect(() =>
			validateGeminiWebRequest(
				request({
					context: {
						messages: [
							{ role: "user", content: [{ type: "image", imageUrl: "data:image/png;base64,sanitized" }] },
						],
					},
				}),
			),
		).toThrow("unsupported image content");
	});
});
