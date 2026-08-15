import type { ExtensionAPI } from "@tsuuanmi/pi/extensions";
import { AccountRegistry } from "#internet/accounts/registry";
import { readDaemonStatus } from "#internet/backends/openai/daemon/status";
import { registerInternetProviders } from "#internet/backends/registry";
import { isOpenAiAccount } from "#internet/core/types";
import { CouncilService } from "#internet/council/service";
import { OwnedDaemonManager } from "#internet/daemon/manager";
import { registerInternetHooks } from "#internet/hooks";
import { InternetSettingsStore } from "#internet/settings";
import { registerInternetTools } from "#internet/tools/register";

export default async function internetExtension(host: ExtensionAPI): Promise<void> {
	const registry = new AccountRegistry();
	const accounts = await registry.list();
	const browserAccounts = accounts.filter(isOpenAiAccount);
	const manager = new OwnedDaemonManager(browserAccounts, { registry });
	const settings = new InternetSettingsStore();
	await registerInternetProviders(host, accounts);
	registerInternetTools(host, manager, settings, new CouncilService(accounts));
	registerInternetHooks(host, manager, browserAccounts, settings);
	host.registerHudProvider(readDaemonStatus);
	await manager.autoStart();
}
