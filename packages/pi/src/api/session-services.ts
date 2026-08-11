import type { AuthStorage } from "#pi/auth/storage";
import type { ModelRegistry } from "#pi/loader/model-registry";
import type { DefaultResourceLoaderOptions, ResourceLoader } from "#pi/loader/resources";
import type { SettingsManager } from "#pi/settings/manager";

export interface AgentSessionRuntimeDiagnostic {
	type: "info" | "warning" | "error";
	message: string;
}

/** Coherent cwd-bound services exposed to session extensions. */
export interface AgentSessionServices {
	cwd: string;
	agentDir: string;
	authStorage: AuthStorage;
	settingsManager: SettingsManager;
	modelRegistry: ModelRegistry;
	resourceLoader: ResourceLoader;
	diagnostics: AgentSessionRuntimeDiagnostic[];
	resourceLoaderOptions?: Omit<DefaultResourceLoaderOptions, "cwd" | "agentDir" | "settingsManager">;
	extensionFlagValues?: Map<string, boolean | string>;
}
