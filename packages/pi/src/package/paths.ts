import { createHash } from "node:crypto";
import { join, resolve as resolvePathname, sep } from "node:path";
import { resolvePath as resolveConfiguredPath } from "@tsuuanmi/pi-agent/node";
import { CONFIG_DIR_NAME } from "#pi/config";
import { getHomeDir } from "#pi/resources/constants";
import type { SourceScope } from "#pi/resources/types";
import type { GitSource } from "./git.ts";
import type { NpmSource } from "./types.ts";
import { getExtensionTempFolder } from "./utils.ts";

export class PackagePaths {
	readonly cwd: string;
	readonly agentDir: string;

	constructor(cwd: string, agentDir: string) {
		this.cwd = resolveConfiguredPath(cwd);
		this.agentDir = resolveConfiguredPath(agentDir);
	}

	npmRoot(scope: SourceScope): string {
		if (scope === "temporary") {
			return this.tempDir("npm");
		}
		if (scope === "project") {
			return join(this.cwd, CONFIG_DIR_NAME, "npm");
		}
		return join(this.agentDir, "npm");
	}

	npmPath(source: NpmSource, scope: SourceScope): string {
		return this.managed(this.npmRoot(scope), "node_modules", source.name);
	}

	gitRoot(scope: SourceScope): string | undefined {
		if (scope === "temporary") {
			return undefined;
		}
		if (scope === "project") {
			return join(this.cwd, CONFIG_DIR_NAME, "git");
		}
		return join(this.agentDir, "git");
	}

	gitPath(source: GitSource, scope: SourceScope): string {
		if (scope === "temporary") {
			return this.tempDir(`git-${source.host}`, source.path);
		}
		const root = this.gitRoot(scope);
		if (!root) {
			throw new Error("Missing git install root");
		}
		return this.managed(root, source.host, source.path);
	}

	tempDir(prefix: string, suffix?: string): string {
		const root = this.managed(getExtensionTempFolder(this.agentDir), prefix);
		const hash = createHash("sha256")
			.update(`${prefix}-${suffix ?? ""}`)
			.digest("hex")
			.slice(0, 8);
		return this.managed(root, hash, suffix ?? "");
	}

	baseDir(scope: SourceScope): string {
		if (scope === "project") {
			return join(this.cwd, CONFIG_DIR_NAME);
		}
		if (scope === "user") {
			return this.agentDir;
		}
		return this.cwd;
	}

	resolve(input: string): string {
		return resolveConfiguredPath(input, this.cwd, { homeDir: getHomeDir(), trim: true });
	}

	resolveFrom(input: string, baseDir: string): string {
		return resolveConfiguredPath(input, baseDir, { homeDir: getHomeDir(), trim: true });
	}

	private managed(root: string, ...parts: string[]): string {
		const resolvedRoot = resolvePathname(root);
		const resolvedPath = resolvePathname(resolvedRoot, ...parts);
		if (resolvedPath !== resolvedRoot && !resolvedPath.startsWith(`${resolvedRoot}${sep}`)) {
			throw new Error(`Refusing to use path outside package install root: ${resolvedPath}`);
		}
		return resolvedPath;
	}
}
