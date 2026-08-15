import type { GoogleInternetAccount } from "#internet/core/types";
import { createGoogleProviderConfig, googleProviderName } from "#internet/providers/google/provider";

const account: GoogleInternetAccount = {
	id: "research",
	provider: "google",
	displayName: "Research",
	enabled: true,
	apiKeyEnv: "GEMINI_RESEARCH_KEY",
};

describe("Google provider", () => {
	it("uses Google's OpenAI-compatible endpoint", () => {
		expect(googleProviderName(account)).toBe("gemini-api-research");
		expect(createGoogleProviderConfig(account)).toMatchObject({
			api: "openai-completions",
			baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
			apiKey: "$GEMINI_RESEARCH_KEY",
			models: expect.arrayContaining([expect.objectContaining({ id: "gemini-2.5-pro" })]),
		});
	});
});
