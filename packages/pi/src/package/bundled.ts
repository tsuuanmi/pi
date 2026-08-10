import { existsSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readManifest } from "#pi/resources/manifest";

export interface BundledPackage {
	name: string;
	source: string;
	root: string;
}

const BUNDLED_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "packages");

export function getBundledPackages(): BundledPackage[] {
	return readdirSync(BUNDLED_ROOT, { withFileTypes: true })
		.filter((entry) => entry.isDirectory())
		.sort((a, b) => a.name.localeCompare(b.name))
		.flatMap((entry) => {
			const root = join(BUNDLED_ROOT, entry.name);
			if (!readManifest(root)) return [];
			if (!existsSync(join(root, "dist"))) throw new Error(`Bundled package has no compiled dist: ${root}`);
			return [{ name: entry.name, source: `pi:${entry.name}`, root }];
		});
}

export function findBundledPackage(source: string): BundledPackage | undefined {
	return getBundledPackages().find((pkg) => pkg.source === source);
}
