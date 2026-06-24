import type { ThinkingLevel } from "@tsuuanmi/pi-agent-core";
import type { SettingsManager } from "../settings/settings-manager.ts";
import { type AgentProfileLoadResult, type LoadedAgentProfile, loadAgentDefinitions } from "./agent-definitions.ts";

export interface AgentProfile {
	name: string;
	description?: string;
	model?: string;
	thinkingLevel?: ThinkingLevel;
	tools?: string[];
	excludeTools?: string[];
	systemPrompt?: string;
	appendSystemPrompt?: string;
	persistent?: boolean;
}

export type { AgentProfileLoadResult, LoadedAgentProfile };

interface AgentProfileResourceLoader {
	getAgentProfiles?: () => AgentProfileLoadResult;
}

export function loadAgentProfiles(options: {
	cwd: string;
	agentDir: string;
	settingsManager: SettingsManager;
	resourceLoader?: AgentProfileResourceLoader;
}): AgentProfileLoadResult {
	const loaded = options.resourceLoader?.getAgentProfiles?.();
	if (loaded) return loaded;
	return loadAgentDefinitions({
		cwd: options.cwd,
		agentDir: options.agentDir,
		projectTrusted: options.settingsManager.isProjectTrusted(),
	});
}

export async function loadAgentProfile(
	options: {
		cwd: string;
		agentDir: string;
		settingsManager: SettingsManager;
		resourceLoader?: AgentProfileResourceLoader;
	},
	name: string | undefined,
): Promise<LoadedAgentProfile | undefined> {
	if (!name) return undefined;
	return loadAgentProfiles(options).profiles.find((profile) => profile.name === name);
}
