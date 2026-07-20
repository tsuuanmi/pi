import { afterEach, describe, expect, it } from "vitest";
import { findEnvKeys, getEnvApiKey } from "#ai/auth/env-api-keys";

const originalOpenAiApiKey = process.env.OPENAI_API_KEY;
const originalOllamaApiKey = process.env.OLLAMA_API_KEY;

function restoreEnvKey(key: "OPENAI_API_KEY" | "OLLAMA_API_KEY", value: string | undefined): void {
	if (value === undefined) {
		delete process.env[key];
	} else {
		process.env[key] = value;
	}
}

afterEach(() => {
	restoreEnvKey("OPENAI_API_KEY", originalOpenAiApiKey);
	restoreEnvKey("OLLAMA_API_KEY", originalOllamaApiKey);
});

describe("environment API keys", () => {
	it("resolves OpenAI credentials from OPENAI_API_KEY", () => {
		process.env.OPENAI_API_KEY = "openai-token";

		expect(findEnvKeys("openai")).toEqual(["OPENAI_API_KEY"]);
		expect(getEnvApiKey("openai")).toBe("openai-token");
	});

	it("resolves Ollama Cloud credentials from OLLAMA_API_KEY", () => {
		process.env.OLLAMA_API_KEY = "ollama-token";

		expect(findEnvKeys("ollama-cloud")).toEqual(["OLLAMA_API_KEY"]);
		expect(getEnvApiKey("ollama-cloud")).toBe("ollama-token");
	});
});
