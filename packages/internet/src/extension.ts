import type { ExtensionAPI } from "@tsuuanmi/pi/extensions";
import { AccountRegistry } from "#internet/accounts/registry";
import { readDaemonStatus } from "#internet/backends/openai/daemon/status";
import { registerOpenAiProviders } from "#internet/backends/openai/provider";
import { OwnedDaemonManager } from "#internet/daemon/manager";
import { registerInternetHooks } from "#internet/hooks";
import { registerInternetTools } from "#internet/tools/register";

export default async function internetExtension(host: ExtensionAPI): Promise<void> {
	const accounts = await new AccountRegistry().list();
	const manager = new OwnedDaemonManager(accounts);
	registerOpenAiProviders(host, accounts);
	registerInternetTools(host, manager);
	registerInternetHooks(host, manager, accounts);
	host.registerHudProvider(readDaemonStatus);
	await manager.autoStart();
}
