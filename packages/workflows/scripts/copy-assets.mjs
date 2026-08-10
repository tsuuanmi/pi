import { cp, mkdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = join(root, "src");
const dist = join(root, "dist");
const skills = ["deep-interview", "ralplan", "team", "ultragoal"];
const skillAssets = ["assets", "references", "scripts"];

await rm(join(dist, "agents"), { recursive: true, force: true });
await rm(join(dist, "state", "assets"), { recursive: true, force: true });
await mkdir(join(dist, "agents"), { recursive: true });
await cp(join(source, "agents"), join(dist, "agents"), { recursive: true });
await cp(join(source, "state", "assets"), join(dist, "state", "assets"), { recursive: true });

for (const skill of skills) {
	const sourceDir = join(source, "skills", skill);
	const distDir = join(dist, "skills", skill);
	await mkdir(distDir, { recursive: true });
	await rm(join(distDir, "SKILL.md"), { force: true });
	await cp(join(sourceDir, "SKILL.md"), join(distDir, "SKILL.md"));
	for (const name of skillAssets) {
		await rm(join(distDir, name), { recursive: true, force: true });
		await cp(join(sourceDir, name), join(distDir, name), { recursive: true });
	}
}
