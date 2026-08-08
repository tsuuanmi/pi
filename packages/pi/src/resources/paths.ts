import { existsSync, statSync } from "node:fs";
import { canonicalizePath } from "@tsuuanmi/pi-agent/node";
import { collectResourceFiles } from "#pi/resources/discovery";
import { resourcePrecedenceRank } from "#pi/resources/patterns";
import type { ResolvedPaths, ResolvedResource, ResourceType } from "#pi/resources/types";

export type ResourceTable = {
	[K in ResourceType]: Map<string, ResolvedResource>;
};

export function createResourceTable(): ResourceTable {
	return {
		extensions: new Map(),
		skills: new Map(),
		prompts: new Map(),
		themes: new Map(),
		commands: new Map(),
		agents: new Map(),
		webProviders: new Map(),
	};
}

export function addResource(table: ResourceTable, type: ResourceType, resource: ResolvedResource): void {
	if (!resource.path) return;

	const key = canonicalizePath(resource.path);
	const current = table[type].get(key);
	if (!current || resourcePrecedenceRank(resource.metadata) < resourcePrecedenceRank(current.metadata)) {
		table[type].set(key, resource);
	}
}

export function addPaths(table: ResourceTable, paths: ResolvedPaths): void {
	for (const type of Object.keys(table) as ResourceType[]) {
		for (const resource of paths[type]) {
			addResource(table, type, resource);
		}
	}
}

export function toResolvedPaths(table: ResourceTable): ResolvedPaths {
	const result = createResourceTable();
	for (const type of Object.keys(table) as ResourceType[]) {
		const resources = [...table[type].values()];
		resources.sort((a, b) => resourcePrecedenceRank(a.metadata) - resourcePrecedenceRank(b.metadata));
		for (const resource of resources) {
			result[type].set(canonicalizePath(resource.path), resource);
		}
	}

	return {
		extensions: [...result.extensions.values()],
		skills: [...result.skills.values()],
		prompts: [...result.prompts.values()],
		themes: [...result.themes.values()],
		commands: [...result.commands.values()],
		agents: [...result.agents.values()],
		webProviders: [...result.webProviders.values()],
	};
}

export function mergeResolvedPaths(...paths: ResolvedPaths[]): ResolvedPaths {
	const table = createResourceTable();
	for (const resourcePaths of paths) {
		addPaths(table, resourcePaths);
	}
	return toResolvedPaths(table);
}

export function collectResourcePaths(paths: string[], type: ResourceType): string[] {
	const files: string[] = [];
	for (const path of paths) {
		if (!existsSync(path) || path.endsWith(".d.ts") || path.endsWith(".map")) continue;

		try {
			const stats = statSync(path);
			if (stats.isFile()) {
				files.push(path);
			} else if (stats.isDirectory()) {
				files.push(...collectResourceFiles(path, type));
			}
		} catch {
			// Ignore unreadable resource paths.
		}
	}
	return files;
}
