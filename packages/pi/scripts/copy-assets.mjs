import { cp, mkdir, readFile, readdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
const packages = join(dist, "packages");
const workspace = join(root, "..");

await rm(packages, { recursive: true, force: true });
await mkdir(packages, { recursive: true });

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

	const compiled = join(source, "dist");
	const target = join(packages, entry.name);
	await cp(manifestPath, join(target, "package.json"));
	await cp(compiled, join(target, "dist"), { recursive: true });
}
