import type { ResolvedPaths } from "#pi/resources/types";
import { CommandRunner } from "./commands.ts";
import { GitManager } from "./git-manager.ts";
import { NpmManager } from "./npm.ts";
import { PackagePaths } from "./paths.ts";
import { ProgressReporter } from "./progress.ts";
import { SourceManager } from "./sources.ts";
import type {
	ConfiguredPackage,
	MissingSourceAction,
	PackageManager,
	PackageManagerOptions,
	ProgressCallback,
} from "./types.ts";

export class DefaultPackageManager implements PackageManager {
	private readonly progress: ProgressReporter;
	private readonly sources: SourceManager;

	constructor(options: PackageManagerOptions) {
		const runner = new CommandRunner(options.commandOutput ?? "ignore");
		const paths = new PackagePaths(options.cwd, options.agentDir);
		this.progress = new ProgressReporter();
		const npm = new NpmManager(options.settingsManager, runner, paths);
		const git = new GitManager(runner, paths, npm);
		this.sources = new SourceManager(options.settingsManager, paths, npm, git, this.progress);
	}

	setProgressCallback(callback: ProgressCallback | undefined): void {
		this.progress.setCallback(callback);
	}

	addSourceToSettings(source: string, options?: { local?: boolean }): boolean {
		return this.sources.add(source, options?.local === true);
	}

	removeSourceFromSettings(source: string, options?: { local?: boolean }): boolean {
		return this.sources.remove(source, options?.local === true);
	}

	getInstalledPath(source: string, scope: "user" | "project"): string | undefined {
		return this.sources.installedPath(source, scope);
	}

	async resolve(onMissing?: (source: string) => Promise<MissingSourceAction>): Promise<ResolvedPaths> {
		return this.sources.resolveConfigured(onMissing);
	}

	async resolveSources(sources: string[], options?: { local?: boolean; temporary?: boolean }): Promise<ResolvedPaths> {
		return this.sources.resolveExplicit(sources, options);
	}

	listConfiguredPackages(): ConfiguredPackage[] {
		return this.sources.list();
	}

	async install(source: string, options?: { local?: boolean }): Promise<void> {
		await this.sources.install(source, options?.local === true);
	}

	async installAndPersist(source: string, options?: { local?: boolean }): Promise<void> {
		await this.install(source, options);
		this.addSourceToSettings(source, options);
	}

	async remove(source: string, options?: { local?: boolean }): Promise<void> {
		await this.sources.removeInstalled(source, options?.local === true);
	}

	async removeAndPersist(source: string, options?: { local?: boolean }): Promise<boolean> {
		await this.remove(source, options);
		return this.removeSourceFromSettings(source, options);
	}
}
