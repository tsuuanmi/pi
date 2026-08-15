import type { ExtensionAPI } from "@tsuuanmi/pi/extensions";
import type { InternetAccount, InternetBackendId } from "#internet/core/types";

export interface InternetBackend {
	readonly id: InternetBackendId;
	providerName(account: InternetAccount): string;
	registerProviders(host: Pick<ExtensionAPI, "registerProvider">, accounts: InternetAccount[]): Promise<void>;
}
