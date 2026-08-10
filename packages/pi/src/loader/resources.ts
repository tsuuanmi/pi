import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";
import type { Theme } from "@tsuuanmi/pi-tui";
import {
	type AgentProfileLoadResult,
	type LoadedAgentProfile,
	loadAgentDefinitions,
} from "#pi/loader/agents/definitions";
import { findPromptFile, loadProjectContextFiles, resolvePrompt } from "#pi/loader/context";
import { resolveResources } from "#pi/loader/discovery";
import type { ResourceDiagnostic } from "#pi/resources/diagnostics";
import { collectResourcePaths } from "#pi/resources/paths";

export type {
	DefaultResourceLoaderOptions,
	ResourceExtensionPaths,
	ResourceLoader,
	ResourceLoaderReloadOptions,
} from "#pi/loader/types";
export type { ResourceCollision, ResourceDiagnostic } from "#pi/resources/diagnostics";

import { canonicalizePath, isLocalPath, resolvePath } from "@tsuuanmi/pi-agent/node";
import type { Extension, ExtensionFactory, ExtensionRuntime, LoadExtensionsResult } from "#pi/api/extension-types";
import { createEventBus, type EventBus } from "#pi/hooks/event-bus";
import { getBuiltinExtensionFactories, loadExtensionFromFactory, loadExtensions } from "#pi/loader/extensions/loader";
import type { PromptTemplate } from "#pi/loader/prompt-templates";
import { loadPromptTemplatesWithDiagnostics } from "#pi/loader/prompt-templates";
import type { Skill } from "#pi/loader/skill";
import { loadSkills } from "#pi/loader/skill";
import { loadThemes } from "#pi/loader/themes";
import type {
	DefaultResourceLoaderOptions,
	ResourceExtensionPaths,
	ResourceLoader,
	ResourceLoaderReloadOptions,
} from "#pi/loader/types";
import { DefaultPackageManager } from "#pi/package/manager";
import type { PathMetadata, ResolvedResource, ResourceType } from "#pi/resources/types";
import { createExtensionRuntime } from "#pi/runtime/extensions/api";
import { SettingsManager } from "#pi/settings/manager";

export class DefaultResourceLoader implements ResourceLoader {
	private cwd: string;
	private agentDir: string;
	private settingsManager: SettingsManager;
	private eventBus: EventBus;
	private packageManager: DefaultPackageManager;
	private additionalExtensionPaths: string[];
	private additionalSkillPaths: string[];
	private additionalPromptTemplatePaths: string[];
	private additionalThemePaths: string[];
	private extensionFactories: ExtensionFactory[];
	private noExtensions: boolean;
	private noSkills: boolean;
	private noPromptTemplates: boolean;
	private noThemes: boolean;
	private noContextFiles: boolean;
	private systemPromptSource?: string;
	private appendSystemPromptSource?: string[];
	private extensionsOverride?: (base: LoadExtensionsResult) => LoadExtensionsResult;
	private skillsOverride?: (base: { skills: Skill[]; diagnostics: ResourceDiagnostic[] }) => {
		skills: Skill[];
		diagnostics: ResourceDiagnostic[];
	};
	private promptsOverride?: (base: { prompts: PromptTemplate[]; diagnostics: ResourceDiagnostic[] }) => {
		prompts: PromptTemplate[];
		diagnostics: ResourceDiagnostic[];
	};
	private themesOverride?: (base: { themes: Theme[]; diagnostics: ResourceDiagnostic[] }) => {
		themes: Theme[];
		diagnostics: ResourceDiagnostic[];
	};
	private agentsFilesOverride?: (base: { agentsFiles: Array<{ path: string; content: string }> }) => {
		agentsFiles: Array<{ path: string; content: string }>;
	};
	private agentProfilesOverride?: (base: AgentProfileLoadResult) => AgentProfileLoadResult;
	private systemPromptOverride?: (base: string | undefined) => string | undefined;
	private appendSystemPromptOverride?: (base: string[]) => string[];

	private extensionsResult: LoadExtensionsResult;
	private skills: Skill[];
	private skillDiagnostics: ResourceDiagnostic[];
	private prompts: PromptTemplate[];
	private promptDiagnostics: ResourceDiagnostic[];
	private themes: Theme[];
	private themeDiagnostics: ResourceDiagnostic[];
	private agentsFiles: Array<{ path: string; content: string }>;
	private agentProfiles: LoadedAgentProfile[];
	private agentProfileDiagnostics: ResourceDiagnostic[];
	private systemPrompt?: string;
	private appendSystemPrompt: string[];
	private lastSkills: ResolvedResource[];
	private lastPrompts: ResolvedResource[];
	private lastThemes: ResolvedResource[];

	constructor(options: DefaultResourceLoaderOptions) {
		this.cwd = resolvePath(options.cwd);
		this.agentDir = resolvePath(options.agentDir);
		this.settingsManager = options.settingsManager ?? SettingsManager.create(this.cwd, this.agentDir);
		this.eventBus = options.eventBus ?? createEventBus();
		this.packageManager = new DefaultPackageManager({
			cwd: this.cwd,
			agentDir: this.agentDir,
			settingsManager: this.settingsManager,
			commandOutput: options.commandOutput,
		});
		this.additionalExtensionPaths = options.additionalExtensionPaths ?? [];
		this.additionalSkillPaths = options.additionalSkillPaths ?? [];
		this.additionalPromptTemplatePaths = options.additionalPromptTemplatePaths ?? [];
		this.additionalThemePaths = options.additionalThemePaths ?? [];
		this.extensionFactories = [
			...(options.noExtensions ? [] : getBuiltinExtensionFactories()),
			...(options.extensionFactories ?? []),
		];
		this.noExtensions = options.noExtensions ?? false;
		this.noSkills = options.noSkills ?? false;
		this.noPromptTemplates = options.noPromptTemplates ?? false;
		this.noThemes = options.noThemes ?? false;
		this.noContextFiles = options.noContextFiles ?? false;
		this.systemPromptSource = options.systemPrompt;
		this.appendSystemPromptSource = options.appendSystemPrompt;
		this.extensionsOverride = options.extensionsOverride;
		this.skillsOverride = options.skillsOverride;
		this.promptsOverride = options.promptsOverride;
		this.themesOverride = options.themesOverride;
		this.agentsFilesOverride = options.agentsFilesOverride;
		this.agentProfilesOverride = options.agentProfilesOverride;
		this.systemPromptOverride = options.systemPromptOverride;
		this.appendSystemPromptOverride = options.appendSystemPromptOverride;

		this.extensionsResult = { extensions: [], errors: [], runtime: createExtensionRuntime() };
		this.skills = [];
		this.skillDiagnostics = [];
		this.prompts = [];
		this.promptDiagnostics = [];
		this.themes = [];
		this.themeDiagnostics = [];
		this.agentsFiles = [];
		this.agentProfiles = [];
		this.agentProfileDiagnostics = [];
		this.appendSystemPrompt = [];
		this.lastSkills = [];
		this.lastPrompts = [];
		this.lastThemes = [];
	}

	getExtensions(): LoadExtensionsResult {
		return this.extensionsResult;
	}

	getSkills(): { skills: Skill[]; diagnostics: ResourceDiagnostic[] } {
		return { skills: this.skills, diagnostics: this.skillDiagnostics };
	}

	getPrompts(): { prompts: PromptTemplate[]; diagnostics: ResourceDiagnostic[] } {
		return { prompts: this.prompts, diagnostics: this.promptDiagnostics };
	}

	getThemes(): { themes: Theme[]; diagnostics: ResourceDiagnostic[] } {
		return { themes: this.themes, diagnostics: this.themeDiagnostics };
	}

	getAgentsFiles(): { agentsFiles: Array<{ path: string; content: string }> } {
		return { agentsFiles: this.agentsFiles };
	}

	getAgentProfiles(): AgentProfileLoadResult {
		return { profiles: this.agentProfiles, diagnostics: this.agentProfileDiagnostics };
	}

	getSystemPrompt(): string | undefined {
		return this.systemPrompt;
	}

	getAppendSystemPrompt(): string[] {
		return this.appendSystemPrompt;
	}

	extendResources(paths: ResourceExtensionPaths): void {
		const skills = this.normalizeExtensionPaths(paths.skillPaths ?? [], "skills");
		const prompts = this.normalizeExtensionPaths(paths.promptPaths ?? [], "prompts");
		const themes = this.normalizeExtensionPaths(paths.themePaths ?? [], "themes");

		if (skills.length > 0) {
			this.lastSkills = this.mergeResources(this.lastSkills, skills);
			this.updateSkills(this.lastSkills);
		}
		if (prompts.length > 0) {
			this.lastPrompts = this.mergeResources(this.lastPrompts, prompts);
			this.updatePrompts(this.lastPrompts);
		}
		if (themes.length > 0) {
			this.lastThemes = this.mergeResources(this.lastThemes, themes);
			this.updateThemes(this.lastThemes);
		}
	}

	async reload(options?: ResourceLoaderReloadOptions): Promise<void> {
		this.settingsManager.reload();
		const onMissing = options?.skipMissingInstalls ? async () => "skip" as const : undefined;
		const resolvedPaths = await resolveResources(this.packageManager, {
			cwd: this.cwd,
			agentDir: this.agentDir,
			settingsManager: this.settingsManager,
			onMissing,
		});
		const enabled = (resources: ResolvedResource[]) => resources.filter((resource) => resource.enabled);
		const enabledExtensions = enabled(resolvedPaths.extensions);
		const enabledSkills = enabled(resolvedPaths.skills);
		const enabledPrompts = enabled(resolvedPaths.prompts);
		const enabledThemes = enabled(resolvedPaths.themes);
		const enabledAgentProfiles = enabled(resolvedPaths.agents);
		const cliExtensions = enabled(this.extraResources(this.additionalExtensionPaths, "extensions"));

		const extensionResources = this.noExtensions
			? cliExtensions
			: this.mergeResources(cliExtensions, enabledExtensions);
		const extensionsResult = await this.loadFinalExtensionSet(extensionResources, undefined);
		for (const resourcePath of this.additionalExtensionPaths) {
			if (isLocalPath(resourcePath)) {
				const resolved = this.resolveResourcePath(resourcePath);
				if (!existsSync(resolved)) {
					extensionsResult.errors.push({ path: resolved, error: `Extension path does not exist: ${resolved}` });
				}
			}
		}
		this.extensionsResult = this.extensionsOverride ? this.extensionsOverride(extensionsResult) : extensionsResult;

		const extraSkills = this.extraResources(this.additionalSkillPaths, "skills");
		const skillResources = this.noSkills ? extraSkills : this.mergeResources(enabledSkills, extraSkills);
		this.lastSkills = skillResources;
		this.updateSkills(skillResources);
		this.addMissingDiagnostics(this.additionalSkillPaths, this.skillDiagnostics, "Skill path does not exist");

		const extraPrompts = this.extraResources(this.additionalPromptTemplatePaths, "prompts");
		const promptResources = this.noPromptTemplates ? extraPrompts : this.mergeResources(enabledPrompts, extraPrompts);
		this.lastPrompts = promptResources;
		this.updatePrompts(promptResources);
		this.addMissingDiagnostics(
			this.additionalPromptTemplatePaths,
			this.promptDiagnostics,
			"Prompt template path does not exist",
		);

		const extraThemes = this.extraResources(this.additionalThemePaths, "themes");
		const themeResources = this.noThemes ? extraThemes : this.mergeResources(enabledThemes, extraThemes);
		this.lastThemes = themeResources;
		this.updateThemes(themeResources);
		this.addMissingDiagnostics(this.additionalThemePaths, this.themeDiagnostics, "Theme path does not exist");

		const agentProfiles = loadAgentDefinitions({
			cwd: this.cwd,
			agentDir: this.agentDir,
			packageAgentResources: enabledAgentProfiles,
		});
		const resolvedAgentProfiles = this.agentProfilesOverride
			? this.agentProfilesOverride(agentProfiles)
			: agentProfiles;
		this.agentProfiles = resolvedAgentProfiles.profiles;
		this.agentProfileDiagnostics = resolvedAgentProfiles.diagnostics;

		const agentsFiles = {
			agentsFiles: this.noContextFiles
				? []
				: loadProjectContextFiles({
						cwd: this.cwd,
						agentDir: this.agentDir,
					}),
		};
		const resolvedAgentsFiles = this.agentsFilesOverride ? this.agentsFilesOverride(agentsFiles) : agentsFiles;
		this.agentsFiles = resolvedAgentsFiles.agentsFiles;

		const baseSystemPrompt = resolvePrompt(
			this.systemPromptSource ?? findPromptFile("SYSTEM.md", this.cwd, this.agentDir),
			"system prompt",
		);
		this.systemPrompt = this.systemPromptOverride ? this.systemPromptOverride(baseSystemPrompt) : baseSystemPrompt;

		const appendPrompt = findPromptFile("APPEND_SYSTEM.md", this.cwd, this.agentDir);
		const appendSources = this.appendSystemPromptSource ?? (appendPrompt ? [appendPrompt] : []);
		const baseAppend = appendSources
			.map((source) => resolvePrompt(source, "append system prompt"))
			.filter((source): source is string => source !== undefined);
		this.appendSystemPrompt = this.appendSystemPromptOverride
			? this.appendSystemPromptOverride(baseAppend)
			: baseAppend;
	}

	private resolveExtensionLoadPath(path: string): string {
		return resolvePath(path, this.cwd, { normalizeUnicodeSpaces: true });
	}

	private async loadFinalExtensionSet(
		resources: ResolvedResource[],
		preTrustExtensions: LoadExtensionsResult | undefined,
	): Promise<LoadExtensionsResult> {
		if (!preTrustExtensions) {
			const result = await loadExtensions(resources, this.cwd, this.eventBus);
			const inline = await this.loadExtensionFactories(result.runtime);
			result.extensions.push(...inline.extensions);
			result.errors.push(...inline.errors);
			this.addExtensionConflictDiagnostics(result);
			return result;
		}

		const preloaded = new Map(
			preTrustExtensions.extensions
				.filter((extension) => !extension.path.startsWith("<inline:"))
				.map((extension) => [extension.resolvedPath, extension]),
		);
		const failed = new Set(preTrustExtensions.errors.map((error) => this.resolveExtensionLoadPath(error.path)));
		const remaining = resources.filter((resource) => {
			const path = this.resolveExtensionLoadPath(resource.path);
			return !preloaded.has(path) && !failed.has(path);
		});
		const loaded = await loadExtensions(remaining, this.cwd, this.eventBus, preTrustExtensions.runtime);
		const byPath = new Map(preloaded);
		for (const extension of loaded.extensions) byPath.set(extension.resolvedPath, extension);

		const ordered = resources
			.map((resource) => byPath.get(this.resolveExtensionLoadPath(resource.path)))
			.filter((extension): extension is Extension => extension !== undefined);
		ordered.push(...preTrustExtensions.extensions.filter((extension) => extension.path.startsWith("<inline:")));

		const result: LoadExtensionsResult = {
			extensions: ordered,
			errors: [...preTrustExtensions.errors, ...loaded.errors],
			runtime: preTrustExtensions.runtime,
		};
		this.addExtensionConflictDiagnostics(result);
		return result;
	}

	private addExtensionConflictDiagnostics(result: LoadExtensionsResult): void {
		for (const conflict of this.detectExtensionConflicts(result.extensions)) {
			result.errors.push({ path: conflict.path, error: conflict.message });
		}
	}

	private normalizeExtensionPaths(
		entries: Array<{ path: string; metadata: PathMetadata }>,
		type: ResourceType,
	): ResolvedResource[] {
		return entries.flatMap((entry) => {
			const root = this.resolveResourcePath(entry.path);
			const metadata = entry.metadata.baseDir
				? { ...entry.metadata, baseDir: this.resolveResourcePath(entry.metadata.baseDir) }
				: entry.metadata;
			return collectResourcePaths([root], type).map((path) => ({
				path,
				enabled: true,
				metadata: metadata.baseDir ? metadata : { ...metadata, baseDir: resolve(path, "..") },
			}));
		});
	}

	private updateSkills(resources: ResolvedResource[]): void {
		const result =
			this.noSkills && resources.length === 0
				? { skills: [], diagnostics: [] }
				: loadSkills({
						cwd: this.cwd,
						agentDir: this.agentDir,
						skillResources: resources,
						includeDefaults: false,
					});
		const resolved = this.skillsOverride ? this.skillsOverride(result) : result;
		this.skills = resolved.skills;
		this.skillDiagnostics = resolved.diagnostics;
	}

	private updatePrompts(resources: ResolvedResource[]): void {
		const loaded =
			this.noPromptTemplates && resources.length === 0
				? { prompts: [], diagnostics: [] }
				: loadPromptTemplatesWithDiagnostics({
						cwd: this.cwd,
						agentDir: this.agentDir,
						promptResources: resources,
						includeDefaults: false,
					});
		const deduped = this.dedupePrompts(loaded.prompts);
		const result = { prompts: deduped.prompts, diagnostics: [...loaded.diagnostics, ...deduped.diagnostics] };
		const resolved = this.promptsOverride ? this.promptsOverride(result) : result;
		this.prompts = resolved.prompts;
		this.promptDiagnostics = resolved.diagnostics;
	}

	private updateThemes(resources: ResolvedResource[]): void {
		const loaded =
			this.noThemes && resources.length === 0 ? { themes: [], diagnostics: [] } : loadThemes(resources, this.cwd);
		const deduped = this.dedupeThemes(loaded.themes);
		const result = { themes: deduped.themes, diagnostics: [...loaded.diagnostics, ...deduped.diagnostics] };
		const resolved = this.themesOverride ? this.themesOverride(result) : result;
		this.themes = resolved.themes;
		this.themeDiagnostics = resolved.diagnostics;
	}

	private addMissingDiagnostics(paths: string[], diagnostics: ResourceDiagnostic[], message: string): void {
		for (const input of paths) {
			if (!isLocalPath(input)) continue;
			const path = this.resolveResourcePath(input);
			if (!existsSync(path)) diagnostics.push({ type: "error", message: `${message}: ${path}`, path });
		}
	}

	private mergeResources(primary: ResolvedResource[], additional: ResolvedResource[]): ResolvedResource[] {
		const merged = new Map<string, ResolvedResource>();
		for (const resource of [...primary, ...additional]) {
			const key = canonicalizePath(resource.path);
			if (!merged.has(key)) merged.set(key, resource);
		}
		return [...merged.values()];
	}

	private extraResources(paths: string[], type: ResourceType): ResolvedResource[] {
		return paths.flatMap((input) => {
			const root = this.resolveResourcePath(input);
			if (!existsSync(root)) return [];
			const baseDir = statSync(root).isDirectory() ? root : resolve(root, "..");
			return collectResourcePaths([root], type).map((path) => ({
				path,
				enabled: true,
				metadata: {
					source: "cli",
					scope: "temporary" as const,
					origin: "top-level" as const,
					baseDir,
				},
			}));
		});
	}

	private resolveResourcePath(input: string): string {
		return resolvePath(input, this.cwd, { trim: true });
	}

	private async loadExtensionFactories(runtime: ExtensionRuntime): Promise<{
		extensions: Extension[];
		errors: Array<{ path: string; error: string }>;
	}> {
		const extensions: Extension[] = [];
		const errors: Array<{ path: string; error: string }> = [];

		for (const [index, factory] of this.extensionFactories.entries()) {
			const extensionPath = `<inline:${index + 1}>`;
			try {
				const extension = await loadExtensionFromFactory(factory, this.cwd, this.eventBus, runtime, extensionPath);
				extensions.push(extension);
			} catch (error) {
				const message = error instanceof Error ? error.message : "failed to load extension";
				errors.push({ path: extensionPath, error: message });
			}
		}

		return { extensions, errors };
	}

	private dedupePrompts(prompts: PromptTemplate[]): { prompts: PromptTemplate[]; diagnostics: ResourceDiagnostic[] } {
		const seen = new Map<string, PromptTemplate>();
		const diagnostics: ResourceDiagnostic[] = [];

		for (const prompt of prompts) {
			const existing = seen.get(prompt.name);
			if (existing) {
				diagnostics.push({
					type: "collision",
					message: `name "/${prompt.name}" collision`,
					path: prompt.filePath,
					collision: {
						resourceType: "prompt",
						name: prompt.name,
						winnerPath: existing.filePath,
						loserPath: prompt.filePath,
					},
				});
			} else {
				seen.set(prompt.name, prompt);
			}
		}

		return { prompts: Array.from(seen.values()), diagnostics };
	}

	private dedupeThemes(themes: Theme[]): { themes: Theme[]; diagnostics: ResourceDiagnostic[] } {
		const seen = new Map<string, Theme>();
		const diagnostics: ResourceDiagnostic[] = [];

		for (const t of themes) {
			const name = t.name ?? "unnamed";
			const existing = seen.get(name);
			if (existing) {
				diagnostics.push({
					type: "collision",
					message: `name "${name}" collision`,
					path: t.sourcePath,
					collision: {
						resourceType: "theme",
						name,
						winnerPath: existing.sourcePath ?? "<builtin>",
						loserPath: t.sourcePath ?? "<builtin>",
					},
				});
			} else {
				seen.set(name, t);
			}
		}

		return { themes: Array.from(seen.values()), diagnostics };
	}

	private detectExtensionConflicts(extensions: Extension[]): Array<{ path: string; message: string }> {
		const conflicts: Array<{ path: string; message: string }> = [];

		// Track which extension registered each tool and flag
		const toolOwners = new Map<string, string>();
		const flagOwners = new Map<string, string>();

		for (const ext of extensions) {
			// Check tools
			for (const toolName of ext.tools.keys()) {
				const existingOwner = toolOwners.get(toolName);
				if (existingOwner && existingOwner !== ext.path) {
					conflicts.push({
						path: ext.path,
						message: `Tool "${toolName}" conflicts with ${existingOwner}`,
					});
				} else {
					toolOwners.set(toolName, ext.path);
				}
			}

			// Check flags
			for (const flagName of ext.flags.keys()) {
				const existingOwner = flagOwners.get(flagName);
				if (existingOwner && existingOwner !== ext.path) {
					conflicts.push({
						path: ext.path,
						message: `Flag "--${flagName}" conflicts with ${existingOwner}`,
					});
				} else {
					flagOwners.set(flagName, ext.path);
				}
			}
		}

		return conflicts;
	}
}
