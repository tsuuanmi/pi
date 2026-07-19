import type { ThinkingLevel } from "@tsuuanmi/pi-agent";
import {
	type AgentProfileLoadResult,
	type LoadedAgentProfile,
	loadAgentDefinitions,
} from "#pi/agents/agent-definitions";
import type { SettingsManager } from "#pi/settings/settings-manager";

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

function loadAgentProfiles(options: {
	cwd: string;
	agentDir: string;
	settingsManager: SettingsManager;
	resourceLoader?: AgentProfileResourceLoader;
}): AgentProfileLoadResult {
	const loaded = options.resourceLoader?.getAgentProfiles?.();
	const result =
		loaded ??
		loadAgentDefinitions({
			cwd: options.cwd,
			agentDir: options.agentDir,
		});
	const agentModels = options.settingsManager.getAgentModelOverrides();
	const agentThinkingLevels = options.settingsManager.getAgentThinkingLevelOverrides();
	if (Object.keys(agentModels).length === 0 && Object.keys(agentThinkingLevels).length === 0) return result;
	return {
		...result,
		profiles: result.profiles.map((profile) => {
			const model = agentModels[profile.name];
			const thinkingLevel = agentThinkingLevels[profile.name];
			return model === undefined && thinkingLevel === undefined
				? profile
				: {
						...profile,
						...(model === undefined ? {} : { model }),
						...(thinkingLevel === undefined ? {} : { thinkingLevel }),
					};
		}),
	};
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
