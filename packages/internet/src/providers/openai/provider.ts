import type { ExtensionAPI, ProviderConfig } from "@tsuuanmi/pi/extensions";
import type { InternetAccount, OpenAiInternetAccount } from "#internet/core/types";
import { readOwnedDaemonCapabilities } from "#internet/daemon/config";
import { accountProviderName } from "#internet/providers/names";
import { daemonBaseUrl } from "#internet/providers/openai/daemon/auth";
import { chatGptWebModels } from "#internet/providers/openai/models";
import { CHATGPT_WEB_PROVIDER } from "#internet/providers/openai/turn/model";

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
