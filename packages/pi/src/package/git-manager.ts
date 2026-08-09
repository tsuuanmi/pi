import { existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import type { SourceScope } from "#pi/resources/types";
import type { CommandRunner } from "./commands.ts";
import type { GitSource } from "./git.ts";
import type { NpmManager } from "./npm.ts";
import type { PackagePaths } from "./paths.ts";
import { ensureGitIgnore, pruneEmptyParents } from "./workspace.ts";

export class GitManager {
	private readonly runner: CommandRunner;
	private readonly paths: PackagePaths;
	private readonly npm: NpmManager;

	constructor(runner: CommandRunner, paths: PackagePaths, npm: NpmManager) {
		this.runner = runner;
		this.paths = paths;
		this.npm = npm;
	}

	path(source: GitSource, scope: SourceScope): string {
		return this.paths.gitPath(source, scope);
	}

	async install(source: GitSource, scope: SourceScope): Promise<void> {
		const target = this.path(source, scope);
		if (existsSync(target)) {
			if (source.ref) await this.checkoutRef(target, source.ref);
			return;
		}

		const root = this.paths.gitRoot(scope);
		if (root) ensureGitIgnore(root);
		mkdirSync(dirname(target), { recursive: true });
		await this.runner.run("git", ["clone", source.repo, target]);
		if (source.ref) {
			await this.runner.run("git", ["checkout", source.ref], { cwd: target });
		}
		if (existsSync(join(target, "package.json"))) {
			await this.npm.installDependencies(target);
		}
	}

	remove(source: GitSource, scope: SourceScope): void {
		const target = this.path(source, scope);
		if (!existsSync(target)) return;
		rmSync(target, { recursive: true, force: true });
		pruneEmptyParents(target, this.paths.gitRoot(scope));
	}

	private async checkoutRef(target: string, ref: string): Promise<void> {
		await this.runner.run("git", ["fetch", "origin", ref], { cwd: target });
		const localHead = await this.runner.capture("git", ["rev-parse", "HEAD"], { cwd: target });
		const targetHead = await this.runner.capture("git", ["rev-parse", "FETCH_HEAD^{commit}"], { cwd: target });
		if (localHead.trim() === targetHead.trim()) return;

		await this.runner.run("git", ["reset", "--hard", "FETCH_HEAD^{commit}"], { cwd: target });
		await this.runner.run("git", ["clean", "-fdx"], { cwd: target });
		if (existsSync(join(target, "package.json"))) {
			await this.npm.installDependencies(target);
		}
	}
}
