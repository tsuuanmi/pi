import type { ExtensionAPI } from "@tsuuanmi/pi/extensions";
import type { InternetAccount, InternetProviderId } from "#internet/core/types";

export interface InternetProvider {
	readonly id: InternetProviderId;
	providerName(account: InternetAccount): string;
	registerProviders(host: Pick<ExtensionAPI, "registerProvider">, accounts: InternetAccount[]): Promise<void>;
}
