import { dirname, join } from "node:path";
import { resolvePath as resolveInput } from "@tsuuanmi/pi-agent/node";
import { CONFIG_DIR_NAME } from "#pi/loader/app";
import type { MissingSourceAction, PackageManager } from "#pi/package-manager/types";
import { AGENTS_STANDARD_DIR_NAMES, getHomeDir, TOP_LEVEL_RESOURCE_TYPES } from "#pi/resources/constants";
import { collectAutoExtensionEntries } from "#pi/resources/discovery";
import {
	collectAncestorAgentsResourceDirs,
	collectAutoPromptEntries,
	collectAutoSkillEntries,
	collectAutoThemeEntries,
} from "#pi/resources/files";
import {
	addResource,
	collectResourcePaths,
	createResourceTable,
	mergeResolvedPaths,
	type ResourceTable,
	toResolvedPaths,
} from "#pi/resources/paths";
import { applyPatterns, isEnabledByOverrides, splitPatterns } from "#pi/resources/patterns";
import type { PathMetadata, ResolvedPaths, ResourceType } from "#pi/resources/types";
import type { Settings, SettingsManager } from "#pi/settings/settings-manager";

export interface ResolveOptions {
	cwd: string;
	agentDir: string;
	settingsManager: SettingsManager;
	onMissing?: (source: string) => Promise<MissingSourceAction>;
}

export async function resolveResources(
	packageManager: Pick<PackageManager, "resolve">,
	options: ResolveOptions,
): Promise<ResolvedPaths> {
	const packages = await packageManager.resolve(options.onMissing);
	const local = resolveLocalResources({
		cwd: options.cwd,
		agentDir: options.agentDir,
		global: options.settingsManager.getGlobalSettings(),
		project: options.settingsManager.getProjectSettings(),
	});
	return mergeResolvedPaths(packages, local);
}

export interface LocalResolveOptions {
	cwd: string;
	agentDir: string;
	global: Settings;
	project: Settings;
}

export function resolveLocalResources(options: LocalResolveOptions): ResolvedPaths {
	const table = createResourceTable();
	const projectBase = join(options.cwd, CONFIG_DIR_NAME);

	for (const type of TOP_LEVEL_RESOURCE_TYPES) {
		const projectEntries = (options.project[type] ?? []) as string[];
		const globalEntries = (options.global[type] ?? []) as string[];
		addLocalEntries(
			table,
			projectEntries,
			type,
			{
				source: "local",
				scope: "project",
				origin: "top-level",
			},
			projectBase,
		);
		addLocalEntries(
			table,
			globalEntries,
			type,
			{
				source: "local",
				scope: "user",
				origin: "top-level",
			},
			options.agentDir,
		);
	}

	addAutoResources(table, options.cwd, options.agentDir, options.global, options.project, projectBase);
	return toResolvedPaths(table);
}

function addLocalEntries(
	table: ResourceTable,
	entries: string[],
	type: ResourceType,
	metadata: PathMetadata,
	baseDir: string,
): void {
	if (entries.length === 0) return;

	const { plain, patterns } = splitPatterns(entries);
	const paths = plain.map((entry) => resolveInput(entry, baseDir, { homeDir: getHomeDir(), trim: true }));
	const files = collectResourcePaths(paths, type);
	const enabled = applyPatterns(files, patterns, baseDir);
	for (const path of files) {
		addResource(table, type, { path, enabled: enabled.has(path), metadata });
	}
}

function addAutoResources(
	table: ResourceTable,
	cwd: string,
	agentDir: string,
	global: Settings,
	project: Settings,
	projectBase: string,
): void {
	const userMetadata: PathMetadata = {
		source: "auto",
		scope: "user",
		origin: "top-level",
		baseDir: agentDir,
	};
	const projectMetadata: PathMetadata = {
		source: "auto",
		scope: "project",
		origin: "top-level",
		baseDir: projectBase,
	};

	const userOverrides = overrides(global);
	const projectOverrides = overrides(project);
	const userDirs = resourceDirs(agentDir);
	const projectDirs = resourceDirs(projectBase);
	const userAgentSkills = AGENTS_STANDARD_DIR_NAMES.map((name) => join(getHomeDir(), name, "skills"));
	const userAgentPrompts = AGENTS_STANDARD_DIR_NAMES.map((name) => join(getHomeDir(), name, "prompts"));
	const projectAgentSkills = collectAncestorAgentsResourceDirs(cwd, "skills");
	const projectAgentPrompts = collectAncestorAgentsResourceDirs(cwd, "prompts");

	addAuto(
		table,
		"extensions",
		collectAutoExtensionEntries(projectDirs.extensions),
		projectMetadata,
		projectOverrides.extensions,
		projectBase,
	);
	addAuto(
		table,
		"skills",
		collectAutoSkillEntries(projectDirs.skills, "pi"),
		projectMetadata,
		projectOverrides.skills,
		projectBase,
	);
	for (const directory of projectAgentSkills) {
		const baseDir = dirname(directory);
		addAuto(
			table,
			"skills",
			collectAutoSkillEntries(directory, "agents"),
			{ ...projectMetadata, baseDir },
			projectOverrides.skills,
			baseDir,
		);
	}
	addAuto(
		table,
		"prompts",
		collectAutoPromptEntries(projectDirs.prompts),
		projectMetadata,
		projectOverrides.prompts,
		projectBase,
	);
	for (const directory of projectAgentPrompts) {
		const baseDir = dirname(directory);
		addAuto(
			table,
			"prompts",
			collectAutoPromptEntries(directory),
			{ ...projectMetadata, baseDir },
			projectOverrides.prompts,
			baseDir,
		);
	}
	addAuto(
		table,
		"themes",
		collectAutoThemeEntries(projectDirs.themes),
		projectMetadata,
		projectOverrides.themes,
		projectBase,
	);

	addAuto(
		table,
		"extensions",
		collectAutoExtensionEntries(userDirs.extensions),
		userMetadata,
		userOverrides.extensions,
		agentDir,
	);
	addAuto(
		table,
		"skills",
		collectAutoSkillEntries(userDirs.skills, "pi"),
		userMetadata,
		userOverrides.skills,
		agentDir,
	);
	for (const directory of userAgentSkills) {
		const baseDir = dirname(directory);
		addAuto(
			table,
			"skills",
			collectAutoSkillEntries(directory, "agents"),
			{ ...userMetadata, baseDir },
			userOverrides.skills,
			baseDir,
		);
	}
	addAuto(table, "prompts", collectAutoPromptEntries(userDirs.prompts), userMetadata, userOverrides.prompts, agentDir);
	for (const directory of userAgentPrompts) {
		const baseDir = dirname(directory);
		addAuto(
			table,
			"prompts",
			collectAutoPromptEntries(directory),
			{ ...userMetadata, baseDir },
			userOverrides.prompts,
			baseDir,
		);
	}
	addAuto(table, "themes", collectAutoThemeEntries(userDirs.themes), userMetadata, userOverrides.themes, agentDir);
}

function addAuto(
	table: ResourceTable,
	type: ResourceType,
	paths: string[],
	metadata: PathMetadata,
	overrides: string[],
	baseDir: string,
): void {
	for (const path of paths) {
		addResource(table, type, {
			path,
			enabled: isEnabledByOverrides(path, overrides, baseDir),
			metadata,
		});
	}
}

function overrides(settings: Settings): Record<"extensions" | "skills" | "prompts" | "themes", string[]> {
	return {
		extensions: (settings.extensions ?? []) as string[],
		skills: (settings.skills ?? []) as string[],
		prompts: (settings.prompts ?? []) as string[],
		themes: (settings.themes ?? []) as string[],
	};
}

function resourceDirs(base: string): {
	extensions: string;
	skills: string;
	prompts: string;
	themes: string;
} {
	return {
		extensions: join(base, "extensions"),
		skills: join(base, "skills"),
		prompts: join(base, "prompts"),
		themes: join(base, "themes"),
	};
}
