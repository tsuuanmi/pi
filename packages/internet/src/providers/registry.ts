import type { ExtensionAPI } from "@tsuuanmi/pi/extensions";
import type { InternetAccount, InternetProviderId } from "#internet/core/types";
import { anthropicProviderName, registerAnthropicProviders } from "#internet/providers/anthropic/provider";
import {
	adaptGeminiWebRequest,
	geminiWebProviderName,
	registerGeminiWebProviders,
} from "#internet/providers/gemini-web/provider";
import { googleProviderName, registerGoogleProviders } from "#internet/providers/google/provider";
import { providerName as openAiProviderName, registerOpenAiProviders } from "#internet/providers/openai/provider";
import { adaptChatGptWebRequest } from "#internet/providers/openai/turn/request";
import type { BrowserRequestIdentity, InternetProvider } from "#internet/providers/provider";

export function adaptInternetRequest(
	provider: InternetProviderId,
	payload: unknown,
	identity: BrowserRequestIdentity,
): unknown {
	const adapter = getInternetProvider(provider).requestAdapter;
	if (!adapter) throw new Error(`No request adapter is registered for ${provider}.`);
	return adapter(payload, identity);
}

const providers: Record<InternetProviderId, InternetProvider> = {
	openai: {
		id: "openai",
		providerName(account) {
			if (account.provider !== "openai") throw new Error(`Expected openai account, received ${account.provider}.`);
			return openAiProviderName(account);
		},
		requestAdapter: adaptChatGptWebRequest,
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
	"gemini-web": {
		id: "gemini-web",
		providerName(account) {
			if (account.provider !== "gemini-web")
				throw new Error(`Expected gemini-web account, received ${account.provider}.`);
			return geminiWebProviderName(account);
		},
		requestAdapter: adaptGeminiWebRequest,
		registerProviders: registerGeminiWebProviders,
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
