import type { ExtensionAPI, ProviderConfig } from "@tsuuanmi/pi/extensions";
import { accountProviderName } from "#internet/backends/names";
import { daemonBaseUrl } from "#internet/backends/openai/daemon/auth";
import { chatGptWebModels } from "#internet/backends/openai/models";
import { CHATGPT_WEB_PROVIDER } from "#internet/backends/openai/turn/model";
import type { InternetAccount, OpenAiInternetAccount } from "#internet/core/types";
import { readOwnedDaemonCapabilities } from "#internet/daemon/config";

export function providerName(account: Pick<OpenAiInternetAccount, "id">): string {
	return accountProviderName(CHATGPT_WEB_PROVIDER, account.id);
}

export async function createOpenAiProviderConfig(account: OpenAiInternetAccount): Promise<ProviderConfig> {
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
	for (const account of accounts) {
		if (!account.enabled || account.backend !== "openai") continue;
		pi.registerProvider(providerName(account), await createOpenAiProviderConfig(account));
	}
}
