/**
 * Resource grouping data for the package settings UI.
 */

import { homedir } from "node:os";
import { basename, dirname } from "node:path";
import { CONFIG_DIR_NAME } from "#pi/loader/app";
import type { PathMetadata, ResolvedPaths, ResolvedResource } from "#pi/resources/types";

export type ResourceType = "extensions" | "skills" | "prompts" | "themes" | "commands";

const RESOURCE_TYPE_LABELS: Record<ResourceType, string> = {
	extensions: "Extensions",
	skills: "Skills",
	prompts: "Prompts",
	themes: "Themes",
	commands: "Commands",
};

export interface ResourceItem {
	path: string;
	enabled: boolean;
	metadata: PathMetadata;
	resourceType: ResourceType;
	displayName: string;
	groupKey: string;
}

export interface ResourceSubgroup {
	type: ResourceType;
	label: string;
	items: ResourceItem[];
}

export interface ResourceGroup {
	key: string;
	label: string;
	scope: "user" | "project" | "temporary";
	origin: "package" | "top-level";
	source: string;
	subgroups: ResourceSubgroup[];
}

function formatBaseDir(baseDir: string): string {
	const homeDir = homedir();
	let displayPath: string;

	if (baseDir === homeDir) {
		displayPath = "~";
	} else if (baseDir.startsWith(homeDir)) {
		// Replace home prefix with ~, normalize separators for display
		const rest = baseDir.slice(homeDir.length);
		displayPath = `~${rest.replace(/\\/g, "/")}`;
	} else {
		displayPath = baseDir.replace(/\\/g, "/");
	}

	return displayPath.endsWith("/") ? displayPath : `${displayPath}/`;
}

function getGroupLabel(metadata: PathMetadata, agentDir: string): string {
	if (metadata.origin === "package") {
		return `${metadata.source} (${metadata.scope})`;
	}
	// Top-level resources
	if (metadata.source === "auto") {
		if (metadata.baseDir) {
			return metadata.scope === "user"
				? `User (${formatBaseDir(metadata.baseDir)})`
				: `Project (${formatBaseDir(metadata.baseDir)})`;
		}
		return metadata.scope === "user" ? `User (${formatBaseDir(agentDir)})` : `Project (${CONFIG_DIR_NAME}/)`;
	}
	return metadata.scope === "user" ? "User settings" : "Project settings";
}

export function buildResourceGroups(resolvedPaths: ResolvedPaths, agentDir: string): ResourceGroup[] {
	const groupMap = new Map<string, ResourceGroup>();

	const addToGroup = (resources: ResolvedResource[], resourceType: ResourceType) => {
		for (const resource of resources) {
			const { path, enabled, metadata } = resource;
			const groupKey = `${metadata.origin}:${metadata.scope}:${metadata.source}:${metadata.baseDir ?? ""}`;

			let group = groupMap.get(groupKey);
			if (!group) {
				group = {
					key: groupKey,
					label: getGroupLabel(metadata, agentDir),
					scope: metadata.scope,
					origin: metadata.origin,
					source: metadata.source,
					subgroups: [],
				};
				groupMap.set(groupKey, group);
			}

			let subgroup = group.subgroups.find((subgroup) => subgroup.type === resourceType);
			if (!subgroup) {
				subgroup = {
					type: resourceType,
					label: RESOURCE_TYPE_LABELS[resourceType],
					items: [],
				};
				group.subgroups.push(subgroup);
			}

			const fileName = basename(path);
			const parentFolder = basename(dirname(path));
			let displayName: string;
			if (resourceType === "extensions" && parentFolder !== "extensions") {
				displayName = `${parentFolder}/${fileName}`;
			} else if (resourceType === "skills" && fileName === "SKILL.md") {
				displayName = parentFolder;
			} else {
				displayName = fileName;
			}
			subgroup.items.push({
				path,
				enabled,
				metadata,
				resourceType,
				displayName,
				groupKey,
			});
		}
	};

	addToGroup(resolvedPaths.extensions, "extensions");
	addToGroup(resolvedPaths.skills, "skills");
	addToGroup(resolvedPaths.prompts, "prompts");
	addToGroup(resolvedPaths.themes, "themes");
	addToGroup(resolvedPaths.commands, "commands");

	// Sort groups: packages first, then top-level; user before project
	const groups = Array.from(groupMap.values());
	groups.sort((a, b) => {
		if (a.origin !== b.origin) {
			return a.origin === "package" ? -1 : 1;
		}
		if (a.scope !== b.scope) {
			return a.scope === "user" ? -1 : 1;
		}
		return a.source.localeCompare(b.source);
	});

	// Sort subgroups within each group by type order, and items by name
	const typeOrder: Record<ResourceType, number> = { extensions: 0, skills: 1, prompts: 2, themes: 3, commands: 4 };
	for (const group of groups) {
		group.subgroups.sort((a, b) => typeOrder[a.type] - typeOrder[b.type]);
		for (const subgroup of group.subgroups) {
			subgroup.items.sort((a, b) => a.displayName.localeCompare(b.displayName));
		}
	}

	return groups;
}
