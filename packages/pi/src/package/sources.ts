import { existsSync, statSync } from "node:fs";
import { relative } from "node:path";
import { isLocalPath } from "@tsuuanmi/pi-agent/node";
import { addPaths, createResourceTable, type ResourceTable, toResolvedPaths } from "#pi/resources/paths";
import type { PackageFilter, PathMetadata, ResolvedPaths, SourceScope } from "#pi/resources/types";
import type { SettingsManager } from "#pi/settings/manager";
import type { PackageSource } from "#pi/settings/types";
import { parseGitUrl } from "./git.ts";
import type { GitManager } from "./git-manager.ts";
import { loadPackage } from "./loader.ts";
import type { NpmManager } from "./npm.ts";
import type { PackagePaths } from "./paths.ts";
import type { ProgressReporter } from "./progress.ts";
import type { ConfiguredPackage, LocalSource, MissingSourceAction, ParsedSource } from "./types.ts";
import {
	BUNDLED_DEFAULT_PACKAGES,
	BUNDLED_PACKAGE_SOURCES,
	getBundledPackageRoot,
	getNpmVersionRange,
	isOfflineModeEnabled,
} from "./utils.ts";

type PackageEntry = { pkg: PackageSource; scope: SourceScope };

export class SourceManager {
	private readonly settings: SettingsManager;
	private readonly paths: PackagePaths;
	private readonly npm: NpmManager;
	private readonly git: GitManager;
	private readonly progress: ProgressReporter;

	constructor(
		settings: SettingsManager,
		paths: PackagePaths,
		npm: NpmManager,
		git: GitManager,
		progress: ProgressReporter,
	) {
		this.settings = settings;
		this.paths = paths;
		this.npm = npm;
		this.git = git;
		this.progress = progress;
	}

	add(source: string, local = false): boolean {
		const scope: SourceScope = local ? "project" : "user";
		const current = scope === "project" ? this.settings.getProjectSettings() : this.settings.getGlobalSettings();
		const packages = current.packages ?? [];
		const normalized = this.normalize(source, scope);
		const index = packages.findIndex((entry) => this.matches(entry, source, scope));
		if (index >= 0) {
			const existing = packages[index];
			if (this.sourceString(existing) === normalized) return false;
			const next = [...packages];
			next[index] = typeof existing === "string" ? normalized : { ...existing, source: normalized };
			this.save(next, scope);
			return true;
		}
		this.save([...packages, normalized], scope);
		return true;
	}

	remove(source: string, local = false): boolean {
		const scope: SourceScope = local ? "project" : "user";
		const current = scope === "project" ? this.settings.getProjectSettings() : this.settings.getGlobalSettings();
		const packages = current.packages ?? [];
		const next = packages.filter((entry) => !this.matches(entry, source, scope));
		if (next.length === packages.length) return false;
		this.save(next, scope);
		return true;
	}

	installedPath(source: string, scope: "user" | "project"): string | undefined {
		const parsed = this.parse(source);
		if (parsed.type === "npm") {
			const path = this.npm.path(parsed, scope);
			return existsSync(path) ? path : undefined;
		}
		if (parsed.type === "git") {
			const path = this.git.path(parsed, scope);
			return existsSync(path) ? path : undefined;
		}
		if (parsed.type === "local") {
			const path = this.paths.resolveFrom(parsed.path, this.paths.baseDir(scope));
			return existsSync(path) && statSync(path).isDirectory() ? path : undefined;
		}
		if (parsed.type === "bundled") return existsSync(parsed.path) ? parsed.path : undefined;
		return undefined;
	}

	list(): ConfiguredPackage[] {
		const global = this.settings.getGlobalSettings();
		const project = this.settings.getProjectSettings();
		const result: ConfiguredPackage[] = [];
		const seen = new Set<string>();
		const configured = new Set<string>();

		for (const entry of global.packages ?? []) {
			const source = this.sourceString(entry);
			seen.add(this.identity(source, "user"));
			configured.add(source.trim());
			result.push({
				source,
				scope: "user",
				filtered: typeof entry === "object",
				installedPath: this.installedPath(source, "user"),
			});
		}
		for (const entry of project.packages ?? []) {
			const source = this.sourceString(entry);
			seen.add(this.identity(source, "project"));
			configured.add(source.trim());
			result.push({
				source,
				scope: "project",
				filtered: typeof entry === "object",
				installedPath: this.installedPath(source, "project"),
			});
		}
		for (const entry of BUNDLED_DEFAULT_PACKAGES) {
			const source = this.sourceString(entry);
			if (seen.has(this.identity(source, "user")) || configured.has(source.trim())) continue;
			result.push({
				source,
				scope: "user",
				filtered: false,
				installedPath: this.installedPath(source, "user"),
			});
		}
		return result;
	}

	async install(sourceText: string, local = false): Promise<void> {
		const parsed = this.parse(sourceText);
		const scope: SourceScope = local ? "project" : "user";
		await this.progress.run("install", sourceText, `Installing ${sourceText}...`, async () => {
			if (parsed.type === "bundled") return;
			if (parsed.type === "npm") {
				await this.npm.install(parsed, scope);
				return;
			}
			if (parsed.type === "git") {
				await this.git.install(parsed, scope);
				return;
			}
			const path = this.paths.resolve(parsed.path);
			if (!existsSync(path)) throw new Error(`Path does not exist: ${path}`);
			if (!statSync(path).isDirectory()) throw new Error(`Package path must be a directory: ${path}`);
		});
	}

	async removeInstalled(sourceText: string, local = false): Promise<void> {
		const parsed = this.parse(sourceText);
		const scope: SourceScope = local ? "project" : "user";
		await this.progress.run("remove", sourceText, `Removing ${sourceText}...`, async () => {
			if (parsed.type === "bundled" || parsed.type === "local") return;
			if (parsed.type === "npm") {
				await this.npm.uninstall(parsed, scope);
				return;
			}
			await this.git.remove(parsed, scope);
		});
	}

	async resolveConfigured(onMissing?: (source: string) => Promise<MissingSourceAction>): Promise<ResolvedPaths> {
		const global = this.settings.getGlobalSettings();
		const project = this.settings.getProjectSettings();
		const packages: PackageEntry[] = [];
		for (const pkg of project.packages ?? []) packages.push({ pkg, scope: "project" });
		for (const pkg of global.packages ?? []) packages.push({ pkg, scope: "user" });
		for (const pkg of BUNDLED_DEFAULT_PACKAGES) packages.push({ pkg, scope: "user" });
		return this.resolve(this.dedupe(packages), onMissing);
	}

	resolveExplicit(sources: string[], options?: { local?: boolean; temporary?: boolean }): Promise<ResolvedPaths> {
		const scope: SourceScope = options?.temporary ? "temporary" : options?.local ? "project" : "user";
		return this.resolve(sources.map((source) => ({ pkg: source as PackageSource, scope })));
	}

	parse(source: string): ParsedSource {
		const trimmed = source.trim();
		const bundledName = BUNDLED_PACKAGE_SOURCES[trimmed];
		if (bundledName) {
			return { type: "bundled", name: bundledName, path: getBundledPackageRoot(bundledName) };
		}
		if (trimmed.startsWith("npm:")) {
			const spec = trimmed.slice("npm:".length).trim();
			const { name, version } = this.npmSpec(spec);
			return {
				type: "npm",
				spec,
				name,
				version,
				range: getNpmVersionRange(version),
			};
		}
		if (isLocalPath(source)) return { type: "local", path: source };
		const git = parseGitUrl(source);
		return git ?? { type: "local", path: source };
	}

	identity(source: string, scope?: SourceScope): string {
		const parsed = this.parse(source);
		if (parsed.type === "npm") return `npm:${parsed.name}`;
		if (parsed.type === "git") return `git:${parsed.host}/${parsed.path}`;
		if (parsed.type === "bundled") return `pi:${parsed.name}`;
		const base = scope ? this.paths.baseDir(scope) : this.paths.cwd;
		return `local:${this.paths.resolveFrom(parsed.path, base)}`;
	}

	dedupe(packages: PackageEntry[]): PackageEntry[] {
		const seen = new Map<string, PackageEntry>();
		for (const entry of packages) {
			const existing = seen.get(this.identity(this.sourceString(entry.pkg), entry.scope));
			if (!existing || (entry.scope === "project" && existing.scope === "user")) {
				seen.set(this.identity(this.sourceString(entry.pkg), entry.scope), entry);
			}
		}
		return [...seen.values()];
	}

	sourceString(pkg: PackageSource): string {
		return typeof pkg === "string" ? pkg : pkg.source;
	}

	private async resolve(
		entries: PackageEntry[],
		onMissing?: (source: string) => Promise<MissingSourceAction>,
	): Promise<ResolvedPaths> {
		const table = createResourceTable();
		for (const { pkg, scope } of entries) {
			const sourceText = this.sourceString(pkg);
			const filter = typeof pkg === "object" ? pkg : undefined;
			const parsed = this.parse(sourceText);
			const metadata: PathMetadata = { source: sourceText, scope, origin: "package" };
			if (parsed.type === "bundled") {
				metadata.baseDir = parsed.path;
				addPaths(table, loadPackage({ root: parsed.path, metadata, filter }));
				continue;
			}
			if (parsed.type === "local") {
				this.loadLocal(table, parsed, filter, metadata, this.paths.baseDir(scope));
				continue;
			}

			const installMissing = async (): Promise<boolean> => {
				if (isOfflineModeEnabled()) return false;
				if (!onMissing) {
					await this.installParsed(parsed, scope);
					return true;
				}
				const action = await onMissing(sourceText);
				if (action === "skip") return false;
				if (action === "error") throw new Error(`Missing source: ${sourceText}`);
				await this.installParsed(parsed, scope);
				return true;
			};

			if (parsed.type === "npm") {
				let root = this.npm.path(parsed, scope);
				const needsInstall = !existsSync(root) || !this.npm.matches(parsed, root);
				if (needsInstall) {
					if (!(await installMissing())) continue;
					root = this.npm.path(parsed, scope);
				}
				metadata.baseDir = root;
				addPaths(table, loadPackage({ root, metadata, filter }));
				continue;
			}

			const root = this.git.path(parsed, scope);
			if (!existsSync(root)) {
				if (!(await installMissing())) continue;
			}
			metadata.baseDir = root;
			addPaths(table, loadPackage({ root, metadata, filter }));
		}
		return toResolvedPaths(table);
	}

	async installParsed(parsed: ParsedSource, scope: SourceScope): Promise<void> {
		if (parsed.type === "npm") await this.npm.install(parsed, scope);
		if (parsed.type === "git") await this.git.install(parsed, scope);
	}

	private loadLocal(
		table: ResourceTable,
		source: LocalSource,
		filter: PackageFilter | undefined,
		metadata: PathMetadata,
		baseDir: string,
	): void {
		const path = this.paths.resolveFrom(source.path, baseDir);
		if (!existsSync(path) || !statSync(path).isDirectory()) return;
		addPaths(table, loadPackage({ root: path, metadata: { ...metadata, baseDir: path }, filter }));
	}

	private matches(existing: PackageSource, input: string, scope: SourceScope): boolean {
		return this.identity(this.sourceString(existing), scope) === this.identity(input);
	}

	private normalize(source: string, scope: SourceScope): string {
		const parsed = this.parse(source);
		if (parsed.type !== "local") return source;
		const relativePath = relative(this.paths.baseDir(scope), this.paths.resolve(parsed.path));
		return relativePath || ".";
	}

	private save(packages: PackageSource[], scope: SourceScope): void {
		if (scope === "project") this.settings.setProjectPackages(packages);
		else this.settings.setPackages(packages);
	}

	private npmSpec(spec: string): { name: string; version?: string } {
		const match = spec.match(/^(@?[^@]+(?:\/[^@]+)?)(?:@(.+))?$/);
		if (!match) return { name: spec };
		return { name: match[1] ?? spec, version: match[2] };
	}
}
