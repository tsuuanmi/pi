import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadPackage } from "#pi/package-manager/loader";

const roots: string[] = [];

function createRoot(): string {
	const root = mkdtempSync(join(tmpdir(), "pi-package-loader-"));
	roots.push(root);
	return root;
}

function metadata(root: string) {
	return { source: "local", scope: "project" as const, origin: "package" as const, baseDir: root };
}

afterEach(() => {
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("loadPackage", () => {
	it("loads manifest resources without discovering top-level resources", () => {
		const root = createRoot();
		mkdirSync(join(root, "extensions"), { recursive: true });
		mkdirSync(join(root, "skills", "review"), { recursive: true });
		writeFileSync(join(root, "extensions", "main.ts"), "export default () => {};\n");
		writeFileSync(join(root, "skills", "review", "SKILL.md"), "---\nname: review\ndescription: Review\n---\n");
		writeFileSync(join(root, "README.md"), "not a resource\n");
		writeFileSync(
			join(root, "package.json"),
			JSON.stringify({ pi: { extensions: ["extensions/main.ts"], skills: ["skills"] } }),
		);

		const paths = loadPackage({ root, metadata: metadata(root) });

		expect(paths.extensions.map((resource) => resource.path)).toEqual([join(root, "extensions", "main.ts")]);
		expect(paths.skills.map((resource) => resource.path)).toEqual([join(root, "skills", "review", "SKILL.md")]);
		expect(paths.prompts).toEqual([]);
	});

	it("uses convention directories when the package has no manifest", () => {
		const root = createRoot();
		mkdirSync(join(root, "extensions"), { recursive: true });
		writeFileSync(join(root, "extensions", "main.ts"), "export default () => {};\n");
		writeFileSync(join(root, "README.md"), "not a resource\n");

		const paths = loadPackage({ root, metadata: metadata(root) });

		expect(paths.extensions.map((resource) => resource.path)).toEqual([join(root, "extensions", "main.ts")]);
		expect(paths.prompts).toEqual([]);
	});

	it("rejects an invalid manifest instead of using convention discovery", () => {
		const root = createRoot();
		mkdirSync(join(root, "extensions"), { recursive: true });
		writeFileSync(join(root, "extensions", "main.ts"), "export default () => {};\n");
		writeFileSync(join(root, "package.json"), "{\n");

		expect(() => loadPackage({ root, metadata: metadata(root) })).toThrow(
			`Invalid package manifest: ${join(root, "package.json")}`,
		);
	});

	it("rejects an array manifest value", () => {
		const root = createRoot();
		mkdirSync(join(root, "extensions"), { recursive: true });
		writeFileSync(join(root, "extensions", "main.ts"), "export default () => {};\n");
		writeFileSync(join(root, "package.json"), JSON.stringify({ pi: [] }));

		expect(() => loadPackage({ root, metadata: metadata(root) })).toThrow(
			`Invalid pi manifest in ${join(root, "package.json")}`,
		);
	});

	it("applies package filters after manifest selection", () => {
		const root = createRoot();
		mkdirSync(join(root, "extensions"), { recursive: true });
		mkdirSync(join(root, "skills", "review"), { recursive: true });
		writeFileSync(join(root, "extensions", "main.ts"), "export default () => {};\n");
		writeFileSync(join(root, "skills", "review", "SKILL.md"), "---\nname: review\ndescription: Review\n---\n");
		writeFileSync(
			join(root, "package.json"),
			JSON.stringify({ pi: { extensions: ["extensions/main.ts"], skills: ["skills"] } }),
		);

		const paths = loadPackage({
			root,
			metadata: metadata(root),
			filter: { extensions: ["extensions/main.ts"], skills: [] },
		});

		expect(paths.extensions[0]?.enabled).toBe(true);
		expect(paths.skills[0]?.enabled).toBe(false);
	});
});
