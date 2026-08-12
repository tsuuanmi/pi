import type { ExtensionAPI, ProviderConfig } from "@tsuuanmi/pi/extensions";
import { daemonBaseUrl } from "#internet/backends/openai/daemon/auth";
import { chatGptWebModels } from "#internet/backends/openai/models";
import { CHATGPT_WEB_PROVIDER } from "#internet/backends/openai/turn/model";
import type { InternetAccount } from "#internet/core/types";
import { readOwnedDaemonCapabilities } from "#internet/daemon/config";

export function providerName(account: InternetAccount): string {
	return account.id === "default" ? CHATGPT_WEB_PROVIDER : `${CHATGPT_WEB_PROVIDER}-${account.id}`;
}

export async function createOpenAiProviderConfig(account: InternetAccount): Promise<ProviderConfig> {
	return {
		name: account.displayName,
		api: "openai-responses",
		baseUrl: daemonBaseUrl(account, true),
		apiKey: "local-loopback",
		authHeader: false,
		models: chatGptWebModels(await readOwnedDaemonCapabilities(account)),
	};
}

export async function registerOpenAiProviders(
	pi: Pick<ExtensionAPI, "registerProvider">,
	accounts: InternetAccount[],
): Promise<void> {
	const enabled = accounts.filter((account) => account.enabled && account.backend === "openai");
	for (const account of enabled) {
		pi.registerProvider(providerName(account), await createOpenAiProviderConfig(account));
	}
}
