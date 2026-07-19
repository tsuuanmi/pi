import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { describe, expect, test } from "vitest";

const repoRoot = fileURLToPath(new URL("../", import.meta.url));
const packagesRoot = join(repoRoot, "packages");

interface PackageJson {
	name?: string;
	main?: string;
	exports?: Record<string, unknown>;
}

interface ImportTarget {
	packageDir: string;
	packageName: string;
	exportPath: string;
	target: string;
}

function isImportMap(value: unknown): value is { import: string } {
	return typeof value === "object" && value !== null && "import" in value && typeof value.import === "string";
}

function listJsFiles(dir: string): string[] {
	const files: string[] = [];
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const abs = join(dir, entry.name);
		if (entry.isDirectory()) {
			files.push(...listJsFiles(abs));
			continue;
		}
		if (entry.isFile() && entry.name.endsWith(".js")) files.push(abs);
	}
	return files;
}

function expandWildcardTarget(
	packageDir: string,
	exportPath: string,
	target: string,
	packageName: string,
): ImportTarget[] {
	const starIndex = target.indexOf("*");
	if (starIndex === -1) return [{ packageDir, packageName, exportPath, target }];

	const beforeStar = target.slice(0, starIndex);
	const afterStar = target.slice(starIndex + 1);
	const searchDir = join(packageDir, beforeStar);
	if (!statSync(searchDir, { throwIfNoEntry: false })?.isDirectory()) return [];

	return listJsFiles(searchDir)
		.filter((file) => file.endsWith(afterStar))
		.map((file) => {
			const matched = file
				.slice(join(packageDir, beforeStar).length, file.length - afterStar.length)
				.split(sep)
				.join("/");
			return {
				packageDir,
				packageName,
				exportPath: exportPath.replace("*", matched),
				target: target.replace("*", matched),
			};
		});
}

function publicImportTargets(): ImportTarget[] {
	const targets: ImportTarget[] = [];
	for (const packageDirName of readdirSync(packagesRoot)) {
		const packageDir = join(packagesRoot, packageDirName);
		if (!statSync(packageDir).isDirectory()) continue;

		const packageJsonPath = join(packageDir, "package.json");
		const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8")) as PackageJson;
		if (!packageJson.name) continue;

		if (!packageJson.exports && packageJson.main) {
			targets.push({ packageDir, packageName: packageJson.name, exportPath: ".", target: packageJson.main });
			continue;
		}

		for (const [exportPath, exportValue] of Object.entries(packageJson.exports ?? {})) {
			if (exportPath === "./package.json") continue;
			const target =
				typeof exportValue === "string" ? exportValue : isImportMap(exportValue) ? exportValue.import : undefined;
			if (!target) continue;
			targets.push(...expandWildcardTarget(packageDir, exportPath, target, packageJson.name));
		}
	}
	return targets.sort((a, b) => `${a.packageName}${a.exportPath}`.localeCompare(`${b.packageName}${b.exportPath}`));
}

describe("package public imports", () => {
	for (const target of publicImportTargets()) {
		test(`${target.packageName}${target.exportPath === "." ? "" : target.exportPath.slice(1)} imports`, async () => {
			const targetPath = join(target.packageDir, target.target);
			const module = await import(pathToFileURL(targetPath).href);

			expect(module).toBeDefined();
		}, 30_000);
	}

	test("covers every package export", () => {
		expect(publicImportTargets().map((target) => `${target.packageName}${target.exportPath}`)).toMatchInlineSnapshot(`
			[
			  "@tsuuanmi/pi-agent.",
			  "@tsuuanmi/pi-agent./node",
			  "@tsuuanmi/pi-ai.",
			  "@tsuuanmi/pi-ai./anthropic",
			  "@tsuuanmi/pi-ai./oauth",
			  "@tsuuanmi/pi-ai./openai-codex-responses",
			  "@tsuuanmi/pi-ai./openai-codex-usage",
			  "@tsuuanmi/pi-ai./openai-completions",
			  "@tsuuanmi/pi-ai./openai-responses",
			  "@tsuuanmi/pi-tui.",
			  "@tsuuanmi/pi-workflows.",
			  "@tsuuanmi/pi-workflows./commands/state-command",
			  "@tsuuanmi/pi-workflows./commands/workflow",
			  "@tsuuanmi/pi.",
			  "@tsuuanmi/pi./api/types",
			  "@tsuuanmi/pi./config/config",
			]
		`);
	});
});
