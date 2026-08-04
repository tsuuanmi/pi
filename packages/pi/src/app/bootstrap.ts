import { getAgentDir } from "#pi/loader/paths";
import { applyHttpProxySettings, configureHttpDispatcher } from "#pi/network/http-dispatcher";
import { SettingsManager } from "#pi/settings/settings-manager";

export interface StartupPaths {
	cwd: string;
	agentDir: string;
}

function isTruthyEnv(value: string | undefined): boolean {
	if (!value) return false;
	return value === "1" || value.toLowerCase() === "true" || value.toLowerCase() === "yes";
}

export function bootstrapStartup(): StartupPaths {
	if (isTruthyEnv(process.env.PI_OFFLINE)) {
		process.env.PI_OFFLINE = "1";
	}

	const cwd = process.cwd();
	const agentDir = getAgentDir();
	const settingsManager = SettingsManager.create(cwd, agentDir);
	applyHttpProxySettings(settingsManager.getGlobalSettings().httpProxy);
	configureHttpDispatcher();

	return { cwd, agentDir };
}
