import type { GitSource } from "#pi/package-manager/git";
import type { ResolvedPaths, SourceScope } from "#pi/resources/types";
import type { SettingsManager } from "#pi/settings/settings-manager";

export type MissingSourceAction = "install" | "skip" | "error";

export interface ProgressEvent {
	type: "start" | "progress" | "complete" | "error";
	action: "install" | "remove" | "update" | "clone" | "pull";
	source: string;
	message?: string;
}

export type ProgressCallback = (event: ProgressEvent) => void;

export interface PackageUpdate {
	source: string;
	displayName: string;
	type: "npm" | "git";
	scope: Exclude<SourceScope, "temporary">;
}

export interface ConfiguredPackage {
	source: string;
	scope: "user" | "project";
	filtered: boolean;
	installedPath?: string;
}

export interface PackageManager {
	resolve(onMissing?: (source: string) => Promise<MissingSourceAction>): Promise<ResolvedPaths>;
	install(source: string, options?: { local?: boolean }): Promise<void>;
	installAndPersist(source: string, options?: { local?: boolean }): Promise<void>;
	remove(source: string, options?: { local?: boolean }): Promise<void>;
	removeAndPersist(source: string, options?: { local?: boolean }): Promise<boolean>;
	update(source?: string): Promise<void>;
	listConfiguredPackages(): ConfiguredPackage[];
	resolveSources(sources: string[], options?: { local?: boolean; temporary?: boolean }): Promise<ResolvedPaths>;
	addSourceToSettings(source: string, options?: { local?: boolean }): boolean;
	removeSourceFromSettings(source: string, options?: { local?: boolean }): boolean;
	setProgressCallback(callback: ProgressCallback | undefined): void;
	getInstalledPath(source: string, scope: "user" | "project"): string | undefined;
}

export type CommandOutput = "inherit" | "ignore";

export interface PackageManagerOptions {
	cwd: string;
	agentDir: string;
	settingsManager: SettingsManager;
	commandOutput?: CommandOutput;
}

export type NpmSource = {
	type: "npm";
	spec: string;
	name: string;
	version?: string;
	range?: string;
	pinned: boolean;
};

export type LocalSource = {
	type: "local";
	path: string;
};

export type BundledSource = {
	type: "bundled";
	name: BundledPackageName;
	path: string;
};

export type ParsedSource = NpmSource | GitSource | LocalSource | BundledSource;

export type InstalledSourceScope = Exclude<SourceScope, "temporary">;

export interface ConfiguredUpdateSource {
	source: string;
	scope: InstalledSourceScope;
}

export interface NpmUpdateTarget extends ConfiguredUpdateSource {
	parsed: NpmSource;
}

export interface GitUpdateTarget extends ConfiguredUpdateSource {
	parsed: GitSource;
}

export type BundledPackageName = "workflows";
