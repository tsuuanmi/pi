import { afterEach, describe, expect, it } from "vitest";
import { findEnvKeys, getEnvApiKey } from "#ai/env-api-keys";

const originalOpenAiApiKey = process.env.OPENAI_API_KEY;

afterEach(() => {
	if (originalOpenAiApiKey === undefined) {
		delete process.env.OPENAI_API_KEY;
	} else {
		process.env.OPENAI_API_KEY = originalOpenAiApiKey;
	}
});

describe("environment API keys", () => {
	it("resolves OpenAI credentials from OPENAI_API_KEY", () => {
		process.env.OPENAI_API_KEY = "openai-token";

		expect(findEnvKeys("openai")).toEqual(["OPENAI_API_KEY"]);
		expect(getEnvApiKey("openai")).toBe("openai-token");
	});
});
