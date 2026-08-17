import type { ExtensionAPI, ProviderConfig } from "@tsuuanmi/pi/extensions";
import type { GeminiWebInternetAccount, InternetAccount } from "#internet/core/types";
import { daemonBaseUrl } from "#internet/daemon/auth";
import { readOwnedDaemonCapabilities } from "#internet/daemon/config";
import { geminiWebModels } from "#internet/providers/gemini-web/models";
import { accountProviderName } from "#internet/providers/names";
import type { BrowserRequestIdentity } from "#internet/providers/provider";

export function geminiWebProviderName(account: Pick<GeminiWebInternetAccount, "id">): string {
	return accountProviderName("gemini-web", account.id);
}

export async function createGeminiWebProviderConfig(account: GeminiWebInternetAccount): Promise<ProviderConfig> {
	return {
		name: account.displayName,
		api: "openai-responses",
		baseUrl: daemonBaseUrl(account, true),
		apiKey: "local-loopback",
		authHeader: false,
		models: geminiWebModels(await readOwnedDaemonCapabilities(account)),
	};
}

export function adaptGeminiWebRequest(payload: unknown, identity: BrowserRequestIdentity): unknown {
	if (!payload || typeof payload !== "object" || Array.isArray(payload))
		throw new Error("Gemini Web request must be an object.");
	const request = payload as Record<string, unknown>;
	if (typeof request.model !== "string" || !["flash", "thinking", "pro"].includes(request.model)) {
		throw new Error("Gemini Web request has an invalid model.");
	}
	const metadata =
		request.metadata && typeof request.metadata === "object" && !Array.isArray(request.metadata)
			? (request.metadata as Record<string, unknown>)
			: {};
	return {
		...request,
		model: `gemini-web/${request.model}`,
		metadata: { ...metadata, pi_caller: { session_id: identity.sessionId, turn_id: identity.turnId } },
	};
}

export async function registerGeminiWebProviders(
	host: Pick<ExtensionAPI, "registerProvider">,
	accounts: InternetAccount[],
): Promise<void> {
	for (const account of accounts) {
		if (!account.enabled || account.provider !== "gemini-web") continue;
		host.registerProvider(geminiWebProviderName(account), await createGeminiWebProviderConfig(account));
	}
}
