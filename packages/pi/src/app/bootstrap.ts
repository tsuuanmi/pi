import { applyHttpProxySettings, configureHttpDispatcher } from "#pi/exec/http-dispatcher";
import { getAgentDir } from "#pi/loader/paths";
import { runMigrations } from "#pi/migrations";
import { SettingsManager } from "#pi/settings/settings-manager";

export interface StartupPaths {
	cwd: string;
	agentDir: string;
}

export interface StartupMigrations {
	migratedProviders: string[];
	deprecationWarnings: string[];
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

export function runStartupMigrations(cwd: string): StartupMigrations {
	const { migratedAuthProviders, deprecationWarnings } = runMigrations(cwd);
	return {
		migratedProviders: migratedAuthProviders,
		deprecationWarnings,
	};
}
