import { describe, expect, it } from "vitest";
import { complete } from "#ai/core/stream";
import type { Context } from "#ai/core/types";
import { getModel } from "#ai/models/index";
import { resolveApiKey } from "#ai-test/utils/oauth/oauth";

const codexToken = await resolveApiKey("openai-codex");

describe("openai-codex cache affinity e2e", () => {
	it.skipIf(!codexToken)("handles SSE requests with aligned cache-affinity identifiers", async () => {
		const model = getModel("openai-codex", "gpt-5.5");
		const sessionId = "0195d6e4-4cf9-7f44-a2d8-f8f7f49ee9d3";
		const context: Context = {
			systemPrompt: "You are a helpful assistant. Reply exactly as requested.",
			messages: [
				{
					role: "user",
					content: "Reply with exactly: cache affinity e2e success",
					timestamp: Date.now(),
				},
			],
		};

		const response = await complete(model, context, {
			apiKey: codexToken,
			sessionId,
			transport: "sse",
		});

		expect(response.stopReason, response.errorMessage).not.toBe("error");
		expect(response.errorMessage).toBeUndefined();
		expect(response.content.map((block) => (block.type === "text" ? block.text : "")).join("")).toContain(
			"cache affinity e2e success",
		);
	});
});
