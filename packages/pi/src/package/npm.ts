import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { satisfies } from "semver";
import type { SourceScope } from "#pi/resources/types";
import type { SettingsManager } from "#pi/settings/manager";
import type { CommandRunner } from "./commands.ts";
import type { PackagePaths } from "./paths.ts";
import type { NpmSource } from "./types.ts";
import { ensureNpmProject } from "./workspace.ts";

export class NpmManager {
	private readonly settings: SettingsManager;
	private readonly runner: CommandRunner;
	private readonly paths: PackagePaths;

	constructor(settings: SettingsManager, runner: CommandRunner, paths: PackagePaths) {
		this.settings = settings;
		this.runner = runner;
		this.paths = paths;
	}

	path(source: NpmSource, scope: SourceScope): string {
		return this.paths.npmPath(source, scope);
	}

	async install(source: NpmSource, scope: SourceScope): Promise<void> {
		const root = this.paths.npmRoot(scope);
		ensureNpmProject(root);
		await this.run(["install", source.spec, "--prefix", root]);
	}

	async uninstall(source: NpmSource, scope: SourceScope): Promise<void> {
		const root = this.paths.npmRoot(scope);
		if (!existsSync(root)) return;
		await this.run(["uninstall", source.name, "--prefix", root]);
	}

	matches(source: NpmSource, installedPath: string): boolean {
		const installedVersion = this.installedVersion(installedPath);
		if (!installedVersion) return false;
		return source.range ? satisfies(installedVersion, source.range) : true;
	}

	installedVersion(installedPath: string): string | undefined {
		const packageJsonPath = join(installedPath, "package.json");
		if (!existsSync(packageJsonPath)) return undefined;
		try {
			const content = readFileSync(packageJsonPath, "utf-8");
			return (JSON.parse(content) as { version?: string }).version;
		} catch {
			return undefined;
		}
	}

	async installDependencies(cwd: string): Promise<void> {
		await this.run(["install", "--omit=dev"], { cwd });
	}

	private async run(args: string[], options?: { cwd?: string }): Promise<void> {
		const command = this.command();
		await this.runner.run(command.name, [...command.args, ...args], options);
	}

	private command(): { name: string; args: string[] } {
		const configured = this.settings.getNpmCommand();
		if (!configured || configured.length === 0) {
			return { name: "npm", args: [] };
		}
		const [name, ...args] = configured;
		if (!name) {
			throw new Error("Invalid npmCommand: first array entry must be a non-empty command");
		}
		return { name, args };
	}
}
