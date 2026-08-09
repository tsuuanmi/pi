import type { SettingsStore } from "#pi/settings/store";
import type { PackageSource } from "#pi/settings/types";

export class ResourceSettings {
	private readonly store: SettingsStore;

	constructor(store: SettingsStore) {
		this.store = store;
	}

	getPackages(): PackageSource[] {
		return structuredClone(this.store.getSettings().packages ?? []);
	}

	setPackages(packages: PackageSource[]): void {
		this.store.updateGlobal("packages", (settings) => {
			settings.packages = structuredClone(packages);
		});
	}

	setProjectPackages(packages: PackageSource[]): void {
		this.store.updateProject("packages", (settings) => {
			settings.packages = structuredClone(packages);
		});
	}

	getExtensionPaths(): string[] {
		return [...(this.store.getSettings().extensions ?? [])];
	}

	setExtensionPaths(paths: string[]): void {
		this.store.updateGlobal("extensions", (settings) => {
			settings.extensions = [...paths];
		});
	}

	setProjectExtensionPaths(paths: string[]): void {
		this.store.updateProject("extensions", (settings) => {
			settings.extensions = [...paths];
		});
	}

	getSkillPaths(): string[] {
		return [...(this.store.getSettings().skills ?? [])];
	}

	setSkillPaths(paths: string[]): void {
		this.store.updateGlobal("skills", (settings) => {
			settings.skills = [...paths];
		});
	}

	setProjectSkillPaths(paths: string[]): void {
		this.store.updateProject("skills", (settings) => {
			settings.skills = [...paths];
		});
	}

	getPromptTemplatePaths(): string[] {
		return [...(this.store.getSettings().prompts ?? [])];
	}

	setPromptTemplatePaths(paths: string[]): void {
		this.store.updateGlobal("prompts", (settings) => {
			settings.prompts = [...paths];
		});
	}

	setProjectPromptTemplatePaths(paths: string[]): void {
		this.store.updateProject("prompts", (settings) => {
			settings.prompts = [...paths];
		});
	}

	getThemePaths(): string[] {
		return [...(this.store.getSettings().themes ?? [])];
	}

	setThemePaths(paths: string[]): void {
		this.store.updateGlobal("themes", (settings) => {
			settings.themes = [...paths];
		});
	}

	setProjectThemePaths(paths: string[]): void {
		this.store.updateProject("themes", (settings) => {
			settings.themes = [...paths];
		});
	}

	getEnableSkillCommands(): boolean {
		return this.store.getSettings().enableSkillCommands ?? true;
	}

	setEnableSkillCommands(enabled: boolean): void {
		this.store.updateGlobal("enableSkillCommands", (settings) => {
			settings.enableSkillCommands = enabled;
		});
	}

	getEnabledModels(): string[] | undefined {
		const patterns = this.store.getSettings().enabledModels;
		return patterns ? [...patterns] : undefined;
	}

	setEnabledModels(patterns: string[] | undefined): void {
		this.store.updateGlobal("enabledModels", (settings) => {
			settings.enabledModels = patterns ? [...patterns] : undefined;
		});
	}
}
