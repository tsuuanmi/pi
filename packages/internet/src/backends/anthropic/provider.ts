import type { ExtensionAPI, ProviderConfig } from "@tsuuanmi/pi/extensions";
import { anthropicModels } from "#internet/backends/anthropic/models";
import { accountProviderName } from "#internet/backends/names";
import type { AnthropicInternetAccount, InternetAccount } from "#internet/core/types";

const providerPrefix = "anthropic-api";

export function anthropicProviderName(account: Pick<AnthropicInternetAccount, "id">): string {
	return accountProviderName(providerPrefix, account.id);
}

export function createAnthropicProviderConfig(account: AnthropicInternetAccount): ProviderConfig {
	return {
		name: account.displayName,
		api: "anthropic-messages",
		baseUrl: "https://api.anthropic.com",
		apiKey: `$${account.apiKeyEnv}`,
		models: anthropicModels,
	};
}

export async function registerAnthropicProviders(
	host: Pick<ExtensionAPI, "registerProvider">,
	accounts: InternetAccount[],
): Promise<void> {
	for (const account of accounts) {
		if (!account.enabled || account.backend !== "anthropic") continue;
		host.registerProvider(anthropicProviderName(account), createAnthropicProviderConfig(account));
	}
}
