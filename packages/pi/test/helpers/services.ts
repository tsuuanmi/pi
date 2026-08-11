import type { AgentSessionServices } from "#pi/api/session-services";
import type { ModelRegistry } from "#pi/loader/model-registry";
import type { ResourceLoader } from "#pi/loader/resources";
import type { SettingsManager } from "#pi/settings/manager";

export function createTestAgentSessionServices(options: {
	cwd: string;
	modelRegistry: ModelRegistry;
	resourceLoader: ResourceLoader;
	settingsManager: SettingsManager;
}): AgentSessionServices {
	return {
		cwd: options.cwd,
		agentDir: options.cwd,
		authStorage: options.modelRegistry.authStorage,
		settingsManager: options.settingsManager,
		modelRegistry: options.modelRegistry,
		resourceLoader: options.resourceLoader,
		diagnostics: [],
	};
}
