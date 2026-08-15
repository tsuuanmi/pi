import type { ExtensionAPI } from "@tsuuanmi/pi/extensions";
import type { InternetAccount, InternetProviderId } from "#internet/core/types";
import { anthropicProviderName, registerAnthropicProviders } from "#internet/providers/anthropic/provider";
import { googleProviderName, registerGoogleProviders } from "#internet/providers/google/provider";
import { providerName as openAiProviderName, registerOpenAiProviders } from "#internet/providers/openai/provider";
import type { InternetProvider } from "#internet/providers/provider";

const providers: Record<InternetProviderId, InternetProvider> = {
	openai: {
		id: "openai",
		providerName(account) {
			if (account.provider !== "openai") throw new Error(`Expected openai account, received ${account.provider}.`);
			return openAiProviderName(account);
		},
		registerProviders: registerOpenAiProviders,
	},
	anthropic: {
		id: "anthropic",
		providerName(account) {
			if (account.provider !== "anthropic")
				throw new Error(`Expected anthropic account, received ${account.provider}.`);
			return anthropicProviderName(account);
		},
		registerProviders: registerAnthropicProviders,
	},
	google: {
		id: "google",
		providerName(account) {
			if (account.provider !== "google") throw new Error(`Expected google account, received ${account.provider}.`);
			return googleProviderName(account);
		},
		registerProviders: registerGoogleProviders,
	},
};

export function getInternetProvider(id: InternetProviderId): InternetProvider {
	return providers[id];
}

export function internetProviderName(account: InternetAccount): string {
	return getInternetProvider(account.provider).providerName(account);
}

export async function registerInternetProviders(
	host: Pick<ExtensionAPI, "registerProvider">,
	accounts: InternetAccount[],
): Promise<void> {
	for (const provider of Object.values(providers)) await provider.registerProviders(host, accounts);
}
