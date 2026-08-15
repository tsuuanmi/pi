import type { ExtensionAPI, ProviderConfig } from "@tsuuanmi/pi/extensions";
import type { GoogleInternetAccount, InternetAccount } from "#internet/core/types";
import { googleModels } from "#internet/providers/google/models";
import { accountProviderName } from "#internet/providers/names";

const providerPrefix = "gemini-api";

export function googleProviderName(account: Pick<GoogleInternetAccount, "id">): string {
	return accountProviderName(providerPrefix, account.id);
}

export function createGoogleProviderConfig(account: GoogleInternetAccount): ProviderConfig {
	return {
		name: account.displayName,
		api: "openai-completions",
		baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
		apiKey: `$${account.apiKeyEnv}`,
		models: googleModels,
	};
}

export async function registerGoogleProviders(
	host: Pick<ExtensionAPI, "registerProvider">,
	accounts: InternetAccount[],
): Promise<void> {
	for (const account of accounts) {
		if (!account.enabled || account.backend !== "google") continue;
		host.registerProvider(googleProviderName(account), createGoogleProviderConfig(account));
	}
}
