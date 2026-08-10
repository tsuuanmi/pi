import { access, readdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

interface PackageManifest {
	files: string[];
	pi: {
		extensions: string[];
		skills: string[];
		agents: string[];
		commands: string[];
	};
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

async function readManifest(): Promise<PackageManifest> {
	return JSON.parse(await readFile(resolve(root, "package.json"), "utf8")) as PackageManifest;
}

describe("package manifest", () => {
	it("publishes one self-contained dist tree", async () => {
		const manifest = await readManifest();
		expect(manifest.files).toEqual(["dist"]);
		expect(manifest.pi).toEqual({
			extensions: ["dist/extension.js"],
			skills: ["dist/skills/**/SKILL.md"],
			agents: ["dist/agents/*.md"],
			commands: ["dist/commands/workflow.js"],
		});
		for (const path of [
			"dist/extension.js",
			"dist/commands/workflow.js",
			"dist/skills/deep-interview/SKILL.md",
			"dist/skills/ralplan/SKILL.md",
			"dist/skills/team/SKILL.md",
			"dist/skills/ultragoal/SKILL.md",
		]) {
			await expect(access(resolve(root, path))).resolves.toBeUndefined();
		}
		expect((await readdir(resolve(root, "dist/agents"))).filter((name) => name.endsWith(".md"))).not.toHaveLength(0);
	});

	it("does not publish source-only package imports", async () => {
		const source = await readFile(resolve(root, "package.json"), "utf8");
		expect(source).not.toContain('"src/extension.ts"');
	});
});
