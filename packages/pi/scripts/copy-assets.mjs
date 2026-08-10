import { cp, mkdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
const packages = join(dist, "packages");
const workspace = join(root, "..");

for (const name of ["workflows"]) {
	const source = join(workspace, name);
	const target = join(packages, name);
	await rm(target, { recursive: true, force: true });
	await mkdir(target, { recursive: true });
	await cp(join(source, "package.json"), join(target, "package.json"));
	await cp(join(source, "dist"), join(target, "dist"), { recursive: true });
}

const subagents = join(dist, "subagents");
await mkdir(subagents, { recursive: true });
await cp(join(root, "src", "subagents", "run-identity.schema.json"), join(subagents, "run-identity.schema.json"));
