import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = join(import.meta.dirname, "../../../../");
const workflowsSrc = join(repoRoot, "packages/workflows/src");
const allowedAgentNodeImports = new Set(["resolvePath", "serializeJsonLine", "withFileMutationQueue"]);

async function listTypeScriptFiles(dir: string): Promise<string[]> {
	const entries = await readdir(dir, { withFileTypes: true });
	const files = await Promise.all(
		entries.map(async (entry) => {
			const path = join(dir, entry.name);
			if (entry.isDirectory()) return listTypeScriptFiles(path);
			if (entry.isFile() && path.endsWith(".ts")) return [path];
			return [];
		}),
	);
	return files.flat();
}

describe("workflow package import boundary", () => {
	it("does not statically import pi host internals", async () => {
		const files = await listTypeScriptFiles(workflowsSrc);
		const offenders: string[] = [];

		for (const file of files) {
			const source = await readFile(file, "utf8");
			if (/from\s+["'](?:@tsuuanmi\/pi(?:\/[^"']*)?|#pi\/[^"']+)["']/.test(source)) {
				offenders.push(file.replace(`${repoRoot}/`, ""));
			}
		}

		expect(offenders).toEqual([]);
	});

	it("uses only approved pi-agent node helpers", async () => {
		const files = await listTypeScriptFiles(workflowsSrc);
		const offenders: string[] = [];
		const importPattern = /import\s+\{([^}]+)\}\s+from\s+["']@tsuuanmi\/pi-agent\/node["']/g;

		for (const file of files) {
			const source = await readFile(file, "utf8");
			for (const match of source.matchAll(importPattern)) {
				const namedImports = match[1]
					.split(",")
					.map((part) =>
						part
							.trim()
							.split(/\s+as\s+/)[0]
							?.trim(),
					)
					.filter((name): name is string => Boolean(name));
				for (const namedImport of namedImports) {
					if (!allowedAgentNodeImports.has(namedImport)) {
						offenders.push(`${file.replace(`${repoRoot}/`, "")}: ${namedImport}`);
					}
				}
			}
		}

		expect(offenders).toEqual([]);
	});
});
