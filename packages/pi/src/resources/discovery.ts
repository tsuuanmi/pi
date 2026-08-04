import { existsSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import ignore from "ignore";
import { FILE_PATTERNS, toPosixPath } from "#pi/resources/constants";
import { addIgnoreRules, collectFiles, collectSkillEntries } from "#pi/resources/files";
import { readManifest } from "#pi/resources/manifest";
import type { ResourceType } from "#pi/resources/types";

function resolveExtensionEntries(dir: string): string[] | null {
	const packageJsonPath = join(dir, "package.json");
	if (existsSync(packageJsonPath)) {
		const manifest = readManifest(dir);
		if (manifest?.extensions?.length) {
			const entries: string[] = [];
			for (const extension of manifest.extensions) {
				const path = resolve(dir, extension);
				if (existsSync(path)) entries.push(path);
			}
			if (entries.length > 0) return entries;
		}
	}

	const indexTs = join(dir, "index.ts");
	const indexJs = join(dir, "index.js");
	if (existsSync(indexTs)) return [indexTs];
	if (existsSync(indexJs)) return [indexJs];
	return null;
}

export function collectAutoExtensionEntries(dir: string): string[] {
	const entries: string[] = [];
	if (!existsSync(dir)) return entries;

	const rootEntries = resolveExtensionEntries(dir);
	if (rootEntries) return rootEntries;

	const ig = ignore();
	addIgnoreRules(ig, dir, dir);
	try {
		for (const entry of readdirSync(dir, { withFileTypes: true })) {
			if (entry.name.startsWith(".") || entry.name === "node_modules") continue;

			const fullPath = join(dir, entry.name);
			let isDir = entry.isDirectory();
			let isFile = entry.isFile();
			if (entry.isSymbolicLink()) {
				try {
					const stats = statSync(fullPath);
					isDir = stats.isDirectory();
					isFile = stats.isFile();
				} catch {
					continue;
				}
			}

			const relativePath = toPosixPath(relative(dir, fullPath));
			const ignorePath = isDir ? `${relativePath}/` : relativePath;
			if (ig.ignores(ignorePath)) continue;

			if (isFile && entry.name.endsWith(".ts") && !entry.name.endsWith(".d.ts")) {
				entries.push(fullPath);
			} else if (isFile && entry.name.endsWith(".js")) {
				entries.push(fullPath);
			} else if (isDir) {
				const nestedEntries = resolveExtensionEntries(fullPath);
				if (nestedEntries) entries.push(...nestedEntries);
			}
		}
	} catch {
		// Ignore unreadable directories.
	}
	return entries;
}

export function collectResourceFiles(dir: string, resourceType: ResourceType): string[] {
	if (resourceType === "skills") return collectSkillEntries(dir, "pi");
	if (resourceType === "extensions") return collectAutoExtensionEntries(dir);
	return collectFiles(dir, FILE_PATTERNS[resourceType]);
}
