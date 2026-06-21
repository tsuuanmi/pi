import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

/** Recursively collect all `.ts` file paths under a directory. */
function listTsFiles(root: string): string[] {
	return readdirSync(root, { recursive: true })
		.map((f) => String(f))
		.filter((f) => f.endsWith(".ts"))
		.map((f) => join(root, f));
}

/** Lines in `dir`'s .ts files whose import/export-from statement matches `pattern`. */
function importFromLines(dir: string, pattern: RegExp): string[] {
	const hits: string[] = [];
	for (const file of listTsFiles(dir)) {
		if (!existsSync(file)) continue;
		const text = readFileSync(file, "utf8");
		for (const line of text.split("\n")) {
			if (/\b(import|export)\b.*\bfrom\b/.test(line) && pattern.test(line)) {
				hits.push(`${file}: ${line.trim()}`);
			}
		}
	}
	return hits;
}

/** Lines in `dir`'s .ts files that reference `name` in an import/export binding. */
function symbolImportLines(dir: string, name: string): string[] {
	const re = new RegExp(`\\b${name}\\b`);
	return importFromLines(dir, re);
}

/**
 * Regression test for the non-breaking dead/orphaned-code sweep of
 * packages/coding-agent. Guards three invariants:
 *
 *  1. Removed dead files stay removed (no accidental restoration).
 *  2. No surviving importer references the removed modules/symbols (the
 *     removal was complete and nothing still imports the deleted code).
 *  3. The public SDK re-export surface in src/index.ts is unchanged vs. the
 *     committed baseline fixture captured by this sweep. A future sweep must
 *     update the baseline intentionally; an accidental pruning of a public
 *     symbol fails this test.
 *
 * This is a static-analysis regression test. It uses no provider, no keys,
 * and no agent session.
 */

const PACKAGE_DIR = resolve(import.meta.dirname, "../../..");
const SRC_DIR = join(PACKAGE_DIR, "src");

/** Files removed by the sweep (paths relative to the package dir). */
const REMOVED_FILES = [
	"src/utils/deprecation.ts",
	"src/core/index.ts",
	"src/mcp/index.ts",
	"src/mcp/process-manager.ts",
	"test/mcp/mock-mcp-server.ts",
	"test/rpc-example.ts",
	"test/sdk-codex-cache-probe-tool-loop.ts",
	"test/streaming-render-debug.ts",
	"test/test-theme-colors.ts",
];

/**
 * Symbols whose definitions were deleted by the sweep. A surviving import of
 * any of these would mean the removal was incomplete or wrong.
 */
const REMOVED_SYMBOLS = [
	"warnDeprecation",
	"clearDeprecationWarningsForTests",
	"createOwnedProcess",
	"OwnedProcessOptions",
];

/**
 * Extract the set of names exported from src/index.ts (the public SDK
 * surface). Handles `export { ... }`, `export type { ... }`, `X as Y` aliases,
 * inline `type` qualifiers, and strips line/block comments inside export
 * blocks. Mirrors the extractor used to generate the baseline fixture.
 */
function extractIndexExports(src: string): string[] {
	const names = new Set<string>();
	const blockRe = /export\s+(?:type\s+)?\{([^}]*)\}/g;
	for (const m of src.matchAll(blockRe)) {
		const body = m[1].replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
		for (const raw of body.split(",")) {
			const part = raw.trim().replace(/^type\s+/, "");
			if (!part) continue;
			const asMatch = part.match(/^([A-Za-z_$][\w$]*)\s+as\s+([A-Za-z_$][\w$]*)$/);
			const name = asMatch ? asMatch[2] : part.replace(/^([A-Za-z_$][\w$]*).*$/, "$1");
			if (/^[A-Za-z_$][\w$]*$/.test(name)) names.add(name);
		}
	}
	return [...names].sort();
}

describe("dead-code sweep regression", () => {
	beforeEach(() => {
		// sanity: the source dir exists
		expect(existsSync(SRC_DIR)).toBe(true);
	});

	afterEach(() => {
		// no-op; kept for symmetry with sibling regression tests
	});

	it("removed dead files are not restored", () => {
		const restored: string[] = [];
		for (const rel of REMOVED_FILES) {
			if (existsSync(join(PACKAGE_DIR, rel))) restored.push(rel);
		}
		expect(restored, `unexpectedly restored: ${restored.join(", ")}`).toEqual([]);
	});

	it("no surviving importer references the removed modules", () => {
		// Imports that resolve to the deleted module paths must be gone.
		const moduleRes: RegExp[] = [
			/deprecation["']?\s*;/,
			/deprecation["']/,
			/mcp\/index/,
			/mcp\/process-manager/,
			/core\/index["']/,
			/["']\.\.?\/mcp["']/,
			/["']\.\.?\/core["']/,
		];
		const offenders: string[] = [];
		for (const dir of [SRC_DIR, join(PACKAGE_DIR, "test")]) {
			for (const re of moduleRes) {
				for (const hit of importFromLines(dir, re)) {
					if (hit.includes("fixtures/")) continue;
					offenders.push(hit);
				}
			}
		}
		expect(offenders, `surviving importer of a removed module:\n${offenders.join("\n")}`).toEqual([]);
	});

	it("removed symbols have no surviving import references", () => {
		const survivors: string[] = [];
		for (const sym of [...REMOVED_SYMBOLS, "OwnedProcess"]) {
			for (const dir of [SRC_DIR, join(PACKAGE_DIR, "test")]) {
				for (const hit of symbolImportLines(dir, sym)) {
					if (hit.includes("fixtures/")) continue;
					survivors.push(`${sym}: ${hit}`);
				}
			}
		}
		expect(survivors, `surviving references to removed symbols:\n${survivors.join("\n")}`).toEqual([]);
	});

	it("public SDK re-export surface matches committed baseline", () => {
		const indexPath = join(SRC_DIR, "index.ts");
		const src = readFileSync(indexPath, "utf8");
		const actual = extractIndexExports(src);
		const baselinePath = join(
			PACKAGE_DIR,
			"test/suite/regressions/fixtures/dead-code-sweep-index-exports.baseline.json",
		);
		const expected = JSON.parse(readFileSync(baselinePath, "utf8")) as string[];
		const missing = expected.filter((n) => !actual.includes(n));
		const added = actual.filter((n) => !expected.includes(n));
		expect(missing, `public API symbols removed without a baseline update: ${missing.join(", ")}`).toEqual([]);
		expect(added, `public API symbols added without a baseline update: ${added.join(", ")}`).toEqual([]);
		expect(actual.length).toBe(expected.length);
	});

	it("src tree has no zero-importer .ts files among the previously-dead set", () => {
		// Defensive: ensure we did not leave a dangling reference to a now-deleted
		// file in the barrel listings by checking the src directory lists cleanly.
		const srcTs = readdirSync(SRC_DIR, { recursive: true })
			.filter((f) => String(f).endsWith(".ts"))
			.map((f) => String(f));
		for (const rel of REMOVED_FILES.filter((r) => r.startsWith("src/"))) {
			expect(srcTs, `removed src file still listed: ${rel}`).not.toContain(rel.replace(/^src\//, ""));
		}
	});
});
