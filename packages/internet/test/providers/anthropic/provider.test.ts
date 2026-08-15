import type { AnthropicInternetAccount } from "#internet/core/types";
import { anthropicProviderName, createAnthropicProviderConfig } from "#internet/providers/anthropic/provider";

const account: AnthropicInternetAccount = {
	id: "research",
	provider: "anthropic",
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
