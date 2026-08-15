import { existsSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readManifest } from "#pi/resources/manifest";

export interface BundledPackage {
	name: string;
	source: string;
	root: string;
}

const MODULE_ROOT = dirname(fileURLToPath(import.meta.url));
const COMPILED_BUNDLED_ROOT = resolve(MODULE_ROOT, "..", "packages");
const WORKSPACE_BUNDLED_ROOT = resolve(MODULE_ROOT, "..", "..", "..");
const BUNDLED_ROOT = existsSync(COMPILED_BUNDLED_ROOT) ? COMPILED_BUNDLED_ROOT : WORKSPACE_BUNDLED_ROOT;

export function getBundledPackages(bundledRoot = BUNDLED_ROOT): BundledPackage[] {
	return readdirSync(bundledRoot, { withFileTypes: true })
		.filter((entry) => entry.isDirectory())
		.sort((a, b) => a.name.localeCompare(b.name))
		.flatMap((entry) => {
			const root = join(bundledRoot, entry.name);
			const manifest = readManifest(root);
			if (!manifest) return [];
			if (!existsSync(join(root, "dist"))) {
				if (manifest.bundleOptional === true) return [];
				throw new Error(`Bundled package has no compiled dist: ${root}`);
			}
			return [{ name: entry.name, source: `pi:${entry.name}`, root }];
		});
}

export function findBundledPackage(source: string): BundledPackage | undefined {
	return getBundledPackages().find((pkg) => pkg.source === source);
}
