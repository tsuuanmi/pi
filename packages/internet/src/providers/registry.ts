import type { ExtensionAPI } from "@tsuuanmi/pi/extensions";
import type { InternetAccount, InternetBackendId } from "#internet/core/types";
import { anthropicProviderName, registerAnthropicProviders } from "#internet/providers/anthropic/provider";
import type { InternetBackend } from "#internet/providers/backend";
import { googleProviderName, registerGoogleProviders } from "#internet/providers/google/provider";
import { providerName as openAiProviderName, registerOpenAiProviders } from "#internet/providers/openai/provider";

const backends: Record<InternetBackendId, InternetBackend> = {
	openai: {
		id: "openai",
		providerName(account) {
			if (account.backend !== "openai") throw new Error(`Expected openai account, received ${account.backend}.`);
			return openAiProviderName(account);
		},
		registerProviders: registerOpenAiProviders,
	},
	anthropic: {
		id: "anthropic",
		providerName(account) {
			if (account.backend !== "anthropic")
				throw new Error(`Expected anthropic account, received ${account.backend}.`);
			return anthropicProviderName(account);
		},
		registerProviders: registerAnthropicProviders,
	},
	google: {
		id: "google",
		providerName(account) {
			if (account.backend !== "google") throw new Error(`Expected google account, received ${account.backend}.`);
			return googleProviderName(account);
		},
		registerProviders: registerGoogleProviders,
	},
};

export function getInternetBackend(id: InternetBackendId): InternetBackend {
	return backends[id];
}

export function internetProviderName(account: InternetAccount): string {
	return getInternetBackend(account.backend).providerName(account);
}

export async function registerInternetProviders(
	host: Pick<ExtensionAPI, "registerProvider">,
	accounts: InternetAccount[],
): Promise<void> {
	for (const backend of Object.values(backends)) await backend.registerProviders(host, accounts);
}
