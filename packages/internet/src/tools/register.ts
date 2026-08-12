import type { ExtensionAPI } from "@tsuuanmi/pi/extensions";
import type { OwnedDaemonManager } from "#internet/daemon/manager";
import { registerAccountsTools } from "#internet/tools/accounts";
import { registerCompactTools } from "#internet/tools/compact";
import { registerControlTools } from "#internet/tools/control";
import { registerDaemonTool } from "#internet/tools/daemon";
import { registerStatusTools } from "#internet/tools/status";

export function registerInternetTools(host: Pick<ExtensionAPI, "registerTool">, manager: OwnedDaemonManager): void {
	registerAccountsTools(host);
	registerStatusTools(host);
	registerControlTools(host);
	registerCompactTools(host);
	registerDaemonTool(host, manager);
}
