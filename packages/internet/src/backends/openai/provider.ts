import type { ExtensionAPI, ProviderConfig } from "@tsuuanmi/pi/extensions";
import { daemonBaseUrl } from "#internet/backends/openai/daemon/auth";
import { CHATGPT_WEB_MODELS } from "#internet/backends/openai/models";
import { CHATGPT_WEB_PROVIDER } from "#internet/backends/openai/turn/model";
import type { InternetAccount } from "#internet/core/types";

export function providerName(account: InternetAccount, primaryAccountId?: string): string {
	return account.id === primaryAccountId ? CHATGPT_WEB_PROVIDER : `${CHATGPT_WEB_PROVIDER}-${account.id}`;
}

export function createOpenAiProviderConfig(account: InternetAccount): ProviderConfig {
	return {
		name: account.displayName,
		api: "openai-responses",
		baseUrl: daemonBaseUrl(account, true),
		apiKey: "local-loopback",
		authHeader: false,
		models: CHATGPT_WEB_MODELS,
	};
}

export function registerOpenAiProviders(pi: Pick<ExtensionAPI, "registerProvider">, accounts: InternetAccount[]): void {
	const enabled = accounts.filter((account) => account.enabled && account.backend === "openai");
	const primaryAccountId = enabled.length === 1 ? enabled[0]?.id : undefined;
	for (const account of enabled) {
		pi.registerProvider(providerName(account, primaryAccountId), createOpenAiProviderConfig(account));
	}
}
