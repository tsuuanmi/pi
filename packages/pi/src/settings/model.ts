import type { ThinkingLevel } from "@tsuuanmi/pi-ai";
import type { SettingsStore } from "#pi/settings/store";
import type { ModelProviderSettings, ModelsSettings } from "#pi/settings/types";

export class ModelSettings {
	private readonly store: SettingsStore;

	constructor(store: SettingsStore) {
		this.store = store;
	}

	getModelsConfig(): ModelsSettings | undefined {
		const settings = this.store.getSettings();
		return settings.providers ? { providers: structuredClone(settings.providers) } : undefined;
	}

	upsertModelProvider(providerId: string, provider: ModelProviderSettings): void {
		this.store.updateGlobal(
			"providers",
			(settings) => {
				settings.providers = {
					...(settings.providers ?? {}),
					[providerId]: structuredClone(provider),
				};
			},
			providerId,
		);
	}

	getDefaultProvider(): string | undefined {
		return this.store.getSettings().defaultProvider;
	}

	getDefaultModel(): string | undefined {
		return this.store.getSettings().defaultModel;
	}

	setDefaultProvider(provider: string): void {
		this.store.updateGlobal("defaultProvider", (settings) => {
			settings.defaultProvider = provider;
		});
	}

	setDefaultModel(modelId: string): void {
		this.store.updateGlobal("defaultModel", (settings) => {
			settings.defaultModel = modelId;
		});
	}

	setDefaultModelAndProvider(provider: string, modelId: string): void {
		this.store.updateGlobal(["defaultProvider", "defaultModel"], (settings) => {
			settings.defaultProvider = provider;
			settings.defaultModel = modelId;
		});
	}

	getDefaultThinkingLevel(): ThinkingLevel | undefined {
		return this.store.getSettings().defaultThinkingLevel;
	}

	setDefaultThinkingLevel(level: ThinkingLevel): void {
		this.store.updateGlobal("defaultThinkingLevel", (settings) => {
			settings.defaultThinkingLevel = level;
		});
	}

	getAgentModelOverrides(): Record<string, string> {
		return { ...(this.store.getSettings().agentModels ?? {}) };
	}

	getAgentModelOverride(agentName: string): string | undefined {
		return this.store.getSettings().agentModels?.[agentName];
	}

	setAgentModelOverride(agentName: string, modelRef: string | undefined): void {
		this.store.updateGlobal("agentModels", (settings) => {
			const models = { ...(settings.agentModels ?? {}) };
			if (modelRef === undefined) {
				delete models[agentName];
			} else {
				models[agentName] = modelRef;
			}
			settings.agentModels = Object.keys(models).length > 0 ? models : undefined;
		});
	}

	getAgentThinkingLevelOverrides(): Record<string, ThinkingLevel> {
		return { ...(this.store.getSettings().agentThinkingLevels ?? {}) };
	}

	getAgentThinkingLevelOverride(agentName: string): ThinkingLevel | undefined {
		return this.store.getSettings().agentThinkingLevels?.[agentName];
	}

	setAgentThinkingLevelOverride(agentName: string, level: ThinkingLevel | undefined): void {
		this.store.updateGlobal("agentThinkingLevels", (settings) => {
			const levels = { ...(settings.agentThinkingLevels ?? {}) };
			if (level === undefined) {
				delete levels[agentName];
			} else {
				levels[agentName] = level;
			}
			settings.agentThinkingLevels = Object.keys(levels).length > 0 ? levels : undefined;
		});
	}
}
