import type { ExtensionAPI } from "@tsuuanmi/pi/extensions";
import type { InternetAccount, InternetProviderId } from "#internet/core/types";

export interface BrowserRequestIdentity {
	cwd: string;
	sessionId: string;
	turnId: string;
}

export type BrowserRequestAdapter = (payload: unknown, identity: BrowserRequestIdentity) => unknown;

export interface InternetProvider {
	readonly id: InternetProviderId;
	providerName(account: InternetAccount): string;
	requestAdapter?: BrowserRequestAdapter;
	registerProviders(host: Pick<ExtensionAPI, "registerProvider">, accounts: InternetAccount[]): Promise<void>;
}
