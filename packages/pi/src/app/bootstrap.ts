import { getAgentDir } from "#pi/loader/paths";
import { applyHttpProxySettings, configureHttpDispatcher } from "#pi/network/http-dispatcher";
import { SettingsManager } from "#pi/settings/manager";

export interface StartupPaths {
	cwd: string;
	agentDir: string;
}

export function bootstrapStartup(): StartupPaths {
	const cwd = process.cwd();
	const agentDir = getAgentDir();
	const settingsManager = SettingsManager.create(cwd, agentDir);
	applyHttpProxySettings(settingsManager.getGlobalSettings().httpProxy);
	configureHttpDispatcher();

	return { cwd, agentDir };
}
