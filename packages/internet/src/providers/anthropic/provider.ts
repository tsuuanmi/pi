import type { ExtensionAPI, ProviderConfig } from "@tsuuanmi/pi/extensions";
import type { AnthropicInternetAccount, InternetAccount } from "#internet/core/types";
import { anthropicModels } from "#internet/providers/anthropic/models";
import { accountProviderName } from "#internet/providers/names";

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
