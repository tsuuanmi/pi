import type { ExtensionAPI } from "@tsuuanmi/pi/extensions";
import type { OwnedDaemonManager } from "#internet/daemon/manager";
import type { InternetSettingsService } from "#internet/settings";
import { registerAccountsTools } from "#internet/tools/accounts";
import { registerCompactTools } from "#internet/tools/compact";
import { registerControlTools } from "#internet/tools/control";
import { registerConversationTool } from "#internet/tools/conversations";
import { registerDaemonTool } from "#internet/tools/daemon";
import { registerDoctorTool } from "#internet/tools/doctor";
import { registerHarnessTool } from "#internet/tools/harness";
import { registerSettingsTool } from "#internet/tools/settings";
import { registerStatusTools } from "#internet/tools/status";
import { registerWebTools } from "#internet/tools/web";

export function registerInternetTools(
	host: Pick<ExtensionAPI, "registerTool">,
	manager: OwnedDaemonManager,
	settings: InternetSettingsService,
): void {
	registerAccountsTools(host);
	registerStatusTools(host);
	registerDoctorTool(host);
	registerControlTools(host);
	registerCompactTools(host);
	registerDaemonTool(host, manager);
	registerConversationTool(host, manager);
	registerHarnessTool(host, manager);
	registerSettingsTool(host, settings);
	registerWebTools(host);
}
