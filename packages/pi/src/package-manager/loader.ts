import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { globSync } from "glob";
import { RESOURCE_TYPES } from "#pi/resources/constants";
import { collectResourceFiles } from "#pi/resources/discovery";
import { readManifest } from "#pi/resources/manifest";
import {
	addResource,
	collectResourcePaths,
	createResourceTable,
	type ResourceTable,
	toResolvedPaths,
} from "#pi/resources/paths";
import { applyPatterns, hasGlobPattern, isOverridePattern } from "#pi/resources/patterns";
import type { PackageFilter, PathMetadata, PiManifest, ResolvedPaths, ResourceType } from "#pi/resources/types";

export interface PackageLoadOptions {
	root: string;
	metadata: PathMetadata;
	filter?: PackageFilter;
}

export function loadPackage({ root, metadata, filter }: PackageLoadOptions): ResolvedPaths {
	const table = createResourceTable();
	const manifest = readManifest(root);

	if (filter) {
		for (const type of RESOURCE_TYPES) {
			const patterns = filter[type as keyof PackageFilter];
			const entries = manifest?.[type as keyof PiManifest];
			if (patterns === undefined) {
				if (entries === undefined) loadDefaults(table, root, type, metadata);
				else loadManifest(table, root, type, entries, metadata);
			} else {
				loadFilter(table, root, type, patterns, entries, metadata);
			}
		}
		return toResolvedPaths(table);
	}

	if (manifest) {
		for (const type of RESOURCE_TYPES) {
			loadManifest(table, root, type, manifest[type as keyof PiManifest], metadata);
		}
		return toResolvedPaths(table);
	}

	for (const type of RESOURCE_TYPES) {
		if (existsSync(join(root, type))) loadDefaults(table, root, type, metadata);
	}

	return toResolvedPaths(table);
}

function loadDefaults(table: ResourceTable, root: string, type: ResourceType, metadata: PathMetadata): void {
	const directory = join(root, type);
	for (const path of collectResourceFiles(directory, type)) {
		addResource(table, type, { path, enabled: true, metadata });
	}
}

function loadFilter(
	table: ResourceTable,
	root: string,
	type: ResourceType,
	patterns: string[],
	entries: string[] | undefined,
	metadata: PathMetadata,
): void {
	const allPaths = loadManifestPaths(root, type, entries);
	const enabled = patterns.length === 0 ? new Set<string>() : applyPatterns(allPaths, patterns, root);
	for (const path of allPaths) {
		addResource(table, type, { path, enabled: enabled.has(path), metadata });
	}
}

function loadManifest(
	table: ResourceTable,
	root: string,
	type: ResourceType,
	entries: string[] | undefined,
	metadata: PathMetadata,
): void {
	if (entries === undefined) return;

	const allPaths = collectManifestPaths(entries, root, type);
	const overrides = entries.filter(isOverridePattern);
	const enabled = applyPatterns(allPaths, overrides, root);
	for (const path of allPaths) {
		if (enabled.has(path)) {
			addResource(table, type, { path, enabled: true, metadata });
		}
	}
}

function loadManifestPaths(root: string, type: ResourceType, entries: string[] | undefined): string[] {
	if (entries && entries.length > 0) {
		const paths = collectManifestPaths(entries, root, type);
		const overrides = entries.filter(isOverridePattern);
		return overrides.length > 0 ? [...applyPatterns(paths, overrides, root)] : paths;
	}

	const directory = join(root, type);
	return existsSync(directory) ? collectResourceFiles(directory, type) : [];
}

function collectManifestPaths(entries: string[], root: string, type: ResourceType): string[] {
	const paths = entries
		.filter((entry) => !isOverridePattern(entry))
		.flatMap((entry) => {
			if (!hasGlobPattern(entry)) return [resolve(root, entry)];
			return globSync(entry, { cwd: root, absolute: true, dot: false, nodir: false }).map((path) => resolve(path));
		});
	return collectResourcePaths(paths, type);
}
