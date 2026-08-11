import { cp, mkdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = join(root, "src");
const dist = join(root, "dist");
const skills = ["codex-turn"];

for (const skill of skills) {
	const sourceDir = join(source, "skills", skill);
	const distDir = join(dist, "skills", skill);
	await mkdir(distDir, { recursive: true });
	await rm(join(distDir, "SKILL.md"), { force: true });
	await cp(join(sourceDir, "SKILL.md"), join(distDir, "SKILL.md"));
}
