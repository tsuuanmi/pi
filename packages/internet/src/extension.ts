import type { ExtensionAPI } from "@tsuuanmi/pi/extensions";
import { AccountRegistry } from "#internet/accounts/registry";
import { readDaemonStatus } from "#internet/backends/openai/daemon/status";
import { registerOpenAiProviders } from "#internet/backends/openai/provider";
import { OwnedDaemonManager } from "#internet/daemon/manager";
import { registerInternetHooks } from "#internet/hooks";
import { InternetSettingsStore } from "#internet/settings";
import { registerInternetTools } from "#internet/tools/register";

export default async function internetExtension(host: ExtensionAPI): Promise<void> {
	const accounts = await new AccountRegistry().list();
	const manager = new OwnedDaemonManager(accounts);
	const settings = new InternetSettingsStore();
	await registerOpenAiProviders(host, accounts);
	registerInternetTools(host, manager, settings);
	registerInternetHooks(host, manager, accounts, settings);
	host.registerHudProvider(readDaemonStatus);
	await manager.autoStart();
}
