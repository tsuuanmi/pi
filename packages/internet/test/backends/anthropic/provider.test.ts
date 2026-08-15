import { anthropicProviderName, createAnthropicProviderConfig } from "#internet/backends/anthropic/provider";
import type { AnthropicInternetAccount } from "#internet/core/types";

const account: AnthropicInternetAccount = {
	id: "research",
	backend: "anthropic",
	displayName: "Research",
	enabled: true,
	apiKeyEnv: "ANTHROPIC_RESEARCH_KEY",
};

describe("Anthropic provider", () => {
	it("uses native messages without exposing credentials", () => {
		expect(anthropicProviderName(account)).toBe("anthropic-api-research");
		expect(createAnthropicProviderConfig(account)).toMatchObject({
			api: "anthropic-messages",
			apiKey: "$ANTHROPIC_RESEARCH_KEY",
			models: expect.arrayContaining([expect.objectContaining({ id: "claude-sonnet-5" })]),
		});
	});
});
