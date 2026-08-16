import { cp, mkdir, readFile, readdir, rm, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
const packages = join(dist, "packages");
const workspace = join(root, "..");

await rm(packages, { recursive: true, force: true });
await mkdir(packages, { recursive: true });
await mkdir(join(dist, "loader", "themes"), { recursive: true });
await cp(join(root, "src/loader/themes/dark.json"), join(dist, "loader/themes/dark.json"));
await cp(join(root, "src/loader/themes/light.json"), join(dist, "loader/themes/light.json"));

for (const entry of await readdir(workspace, { withFileTypes: true })) {
	if (!entry.isDirectory()) continue;

	const source = join(workspace, entry.name);
	const manifestPath = join(source, "package.json");
	let manifest;
	try {
		manifest = JSON.parse(await readFile(manifestPath, "utf8"));
	} catch (error) {
		if (error?.code === "ENOENT") continue;
		throw new Error(`Unable to read package manifest: ${manifestPath}`, { cause: error });
	}

	if (!manifest || typeof manifest !== "object" || !("pi" in manifest) || manifest.pi === undefined) continue;
	if (!manifest.pi || typeof manifest.pi !== "object" || Array.isArray(manifest.pi)) {
		throw new Error(`Invalid pi manifest in ${manifestPath}`);
	}
	if ("bundleOptional" in manifest.pi && typeof manifest.pi.bundleOptional !== "boolean") {
		throw new Error(`Invalid pi.bundleOptional manifest entry in ${manifestPath}`);
	}

	const compiled = join(source, "dist");
	let compiledStats;
	try {
		compiledStats = await stat(compiled);
	} catch (error) {
		if (error?.code === "ENOENT") {
			if (manifest.pi.bundleOptional === true) continue;
			throw new Error(`Bundled package has no compiled dist: ${source}`, { cause: error });
		}
		throw new Error(`Unable to inspect compiled package: ${compiled}`, { cause: error });
	}
	if (!compiledStats.isDirectory()) throw new Error(`Compiled package path is not a directory: ${compiled}`);

	const target = join(packages, entry.name);
	await cp(manifestPath, join(target, "package.json"));
	await cp(compiled, join(target, "dist"), { recursive: true });
}
