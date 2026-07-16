/**
 * Dead-function guard for the pi monorepo packages.
 *
 * Scans the TypeScript source tree of every package (each packages/<pkg>/src
 * directory) for two kinds of dead functions:
 *  1. Exported but unused functions — found via the existing knip tooling
 *     (knip.json), then kept only when the module directly declares a function
 *     with that name (parsed with the TypeScript compiler API). Re-export aliases
 *     (exporting a name imported from another module) are NOT counted: the
 *     underlying declaration lives elsewhere and may be used there, so only the
 *     alias is unused, not the function itself.
 *  2. Private (non-exported) top-level functions never referenced anywhere in
 *     their own file — found with a TypeScript AST scan. A non-exported function
 *     can only be referenced inside its own module, so a zero same-file reference
 *     count is a sound deadness signal. The scan is tuned to never report a
 *     function that is actually used; it may under-report in shadowing cases.
 *
 * The current set of dead functions is snapshotted in
 * dead-functions-baseline.json. The test fails only on NEW dead functions
 * (regressions), so the existing baseline does not have to be cleaned up first.
 * When you fix a dead function, the baseline entry becomes stale; update it with:
 *
 *   cd packages/coding-agent
 *   UPDATE_DEADFUNCTIONS_BASELINE=1 npx vitest --run test/dead-functions.test.ts
 *
 * (mirrors the vitest -u snapshot workflow).
 */

import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { expect, test } from "vitest";

const repoRootAbs = fileURLToPath(new URL(join("..", "..", "..", "/"), import.meta.url));
const baselinePath = fileURLToPath(new URL("./dead-functions-baseline.json", import.meta.url));

interface DeadFunction {
	/** Stable identity: "<repo-relative file>::<name>". */
	key: string;
	file: string;
	name: string;
	line: number;
	kind: "exported" | "private";
}

function collectSrcFiles(): string[] {
	const acc: string[] = [];
	function walk(dir: string) {
		for (const e of readdirSync(dir, { withFileTypes: true })) {
			const p = join(dir, e.name);
			if (e.isDirectory()) {
				if (e.name !== "node_modules" && e.name !== "dist") walk(p);
				continue;
			}
			if (
				e.isFile() &&
				p.endsWith(".ts") &&
				!p.endsWith(".d.ts") &&
				p.includes(`${sep}src${sep}`) &&
				!p.includes(`${sep}dist${sep}`)
			) {
				acc.push(p);
			}
		}
	}
	for (const pkg of readdirSync(join(repoRootAbs, "packages"), { withFileTypes: true })) {
		if (pkg.isDirectory()) walk(join(repoRootAbs, "packages", pkg.name));
	}
	return acc.map((p) => relative(repoRootAbs, p).split(sep).join("/"));
}

/** Names exported from a module, used to exclude them from the private scan. */
function exportedNamesOfFile(sf: ts.SourceFile): Set<string> {
	const names = new Set<string>();
	const hasExportModifier = (node: ts.Node): boolean =>
		ts.canHaveModifiers(node) && (ts.getModifiers(node) ?? []).some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
	ts.forEachChild(sf, (stmt) => {
		if (hasExportModifier(stmt)) {
			if (ts.isFunctionDeclaration(stmt) && stmt.name) names.add(stmt.name.text);
			if (ts.isClassDeclaration(stmt) && stmt.name) names.add(stmt.name.text);
			if (ts.isEnumDeclaration(stmt) && stmt.name) names.add(stmt.name.text);
			if (ts.isInterfaceDeclaration(stmt) && stmt.name) names.add(stmt.name.text);
			if (ts.isTypeAliasDeclaration(stmt) && stmt.name) names.add(stmt.name.text);
			if (ts.isVariableStatement(stmt)) {
				for (const d of stmt.declarationList.declarations) {
					if (d.name && ts.isIdentifier(d.name)) names.add(d.name.text);
				}
			}
		}
		if (ts.isExportDeclaration(stmt) && stmt.exportClause && ts.isNamedExports(stmt.exportClause)) {
			for (const el of stmt.exportClause.elements) {
				const local = el.propertyName ?? el.name;
				if (local) names.add(local.text);
			}
		}
		// `export default foo` (identifier) — also covers `export default class X` via the modifier branch above.
		if (ts.isExportAssignment(stmt) && stmt.isExportEquals === false && ts.isIdentifier(stmt.expression)) {
			names.add(stmt.expression.text);
		}
	});
	return names;
}

const sourceFileCache = new Map<string, ts.SourceFile>();

function parseFile(file: string): ts.SourceFile | undefined {
	const cached = sourceFileCache.get(file);
	if (cached) return cached;
	const abs = join(repoRootAbs, file);
	let text: string;
	try {
		text = readFileSync(abs, "utf8");
	} catch {
		return undefined;
	}
	const sf = ts.createSourceFile(abs, text, ts.ScriptTarget.Latest, /*setParentNodes*/ true);
	sourceFileCache.set(file, sf);
	return sf;
}

/**
 * Whether a module directly declares a function with the given name. Re-exports
 * (export { foo } [from "..."]) do NOT count: the underlying declaration lives in
 * another module and may be used there, so only the alias is unused — not the
 * function itself. knip already verified the export is unused, so a matching
 * direct declaration here is a genuinely dead function.
 */
function hasDirectFunctionDeclaration(sf: ts.SourceFile, name: string): boolean {
	let found = false;
	ts.forEachChild(sf, (stmt) => {
		if (found) return;
		if (ts.isFunctionDeclaration(stmt) && stmt.name && stmt.name.text === name) found = true;
		if (ts.isVariableStatement(stmt)) {
			for (const d of stmt.declarationList.declarations) {
				if (
					d.name &&
					ts.isIdentifier(d.name) &&
					d.name.text === name &&
					d.initializer &&
					(ts.isArrowFunction(d.initializer) || ts.isFunctionExpression(d.initializer))
				) {
					found = true;
				}
			}
		}
	});
	return found;
}

function runKnipUnusedExports(): Array<{ file: string; name: string; line: number; col: number }> {
	const res = spawnSync(join(repoRootAbs, "node_modules/.bin/knip"), ["--reporter", "json"], {
		cwd: repoRootAbs,
		encoding: "utf8",
		maxBuffer: 64 * 1024 * 1024,
	});
	if (res.error) throw res.error;
	const j = JSON.parse(res.stdout || "{}") as {
		issues?: Array<{ file: string; exports?: Array<{ name: string; line: number; col: number }> }>;
	};
	const out: Array<{ file: string; name: string; line: number; col: number }> = [];
	for (const g of j.issues ?? []) {
		for (const e of g.exports ?? []) {
			out.push({ file: g.file, name: e.name, line: e.line, col: e.col });
		}
	}
	return out;
}

function findPrivateDeadFunctions(files: string[]): DeadFunction[] {
	const out: DeadFunction[] = [];
	for (const file of files) {
		const sf = parseFile(file);
		if (!sf) continue;
		const exported = exportedNamesOfFile(sf);
		const candidates: Array<{ name: string; declNameNode: ts.Identifier }> = [];
		ts.forEachChild(sf, (stmt) => {
			if (ts.isFunctionDeclaration(stmt) && stmt.name && ts.isIdentifier(stmt.name)) {
				candidates.push({ name: stmt.name.text, declNameNode: stmt.name });
			}
			if (ts.isVariableStatement(stmt)) {
				for (const d of stmt.declarationList.declarations) {
					if (
						d.initializer &&
						(ts.isArrowFunction(d.initializer) || ts.isFunctionExpression(d.initializer)) &&
						d.name &&
						ts.isIdentifier(d.name)
					) {
						candidates.push({ name: d.name.text, declNameNode: d.name });
					}
				}
			}
		});
		const seen = new Set<string>();
		for (const c of candidates) {
			if (seen.has(c.name)) continue;
			seen.add(c.name);
			if (exported.has(c.name)) continue;
			let refs = 0;
			const walk = (n: ts.Node): void => {
				ts.forEachChild(n, (child) => {
					if (ts.isIdentifier(child) && child.text === c.name) {
						const parent = child.parent;
						let skip = false;
						if (child === c.declNameNode) skip = true;
						else if (parent && ts.isPropertyAccessExpression(parent) && parent.name === child) skip = true;
						else if (parent && ts.isQualifiedName(parent) && parent.right === child) skip = true;
						else if (
							parent &&
							(ts.isPropertyAssignment(parent) ||
								ts.isShorthandPropertyAssignment(parent) ||
								ts.isPropertyDeclaration(parent) ||
								ts.isPropertySignature(parent) ||
								ts.isBindingElement(parent)) &&
							parent.name === child
						) {
							skip = true;
						}
						if (!skip) refs++;
					}
					walk(child);
				});
			};
			walk(sf);
			if (refs === 0) {
				const line = sf.getLineAndCharacterOfPosition(c.declNameNode.getStart()).line + 1;
				out.push({ key: `${file}::${c.name}`, file, name: c.name, line, kind: "private" });
			}
		}
	}
	return out;
}

function analyze(): DeadFunction[] {
	const files = collectSrcFiles();
	const exported: DeadFunction[] = [];
	for (const e of runKnipUnusedExports()) {
		const sf = parseFile(e.file);
		if (!sf) continue;
		if (hasDirectFunctionDeclaration(sf, e.name)) {
			exported.push({ key: `${e.file}::${e.name}`, file: e.file, name: e.name, line: e.line, kind: "exported" });
		}
	}
	const privates = findPrivateDeadFunctions(files);
	return [...exported, ...privates].sort((a, b) => a.key.localeCompare(b.key));
}

interface BaselineFile {
	version: number;
	deadFunctions: Array<{ key: string; file: string; name: string; kind: string }>;
}

function loadBaseline(): BaselineFile {
	return JSON.parse(readFileSync(baselinePath, "utf8")) as BaselineFile;
}

function writeBaseline(current: DeadFunction[]): void {
	const data: BaselineFile = {
		version: 1,
		deadFunctions: current.map((f) => ({ key: f.key, file: f.file, name: f.name, kind: f.kind })),
	};
	writeFileSync(baselinePath, `${JSON.stringify(data, null, "\t")}\n`, "utf8");
}

function formatEntry(f: DeadFunction): string {
	return `  [${f.kind}] ${f.file}:${f.line}  ${f.name}`;
}

test("no new dead functions across packages (baseline guard)", { timeout: 120_000 }, () => {
	const current = analyze();

	if (process.env.UPDATE_DEADFUNCTIONS_BASELINE === "1") {
		writeBaseline(current);
		console.info(`dead-functions baseline updated: ${current.length} entries`);
		return;
	}

	const baseline = loadBaseline();
	const baselineKeys = new Set(baseline.deadFunctions.map((f) => f.key));
	const currentByKey = new Map(current.map((f) => [f.key, f] as const));

	const newDead = current.filter((f) => !baselineKeys.has(f.key));
	const removed = baseline.deadFunctions.filter((f) => !currentByKey.has(f.key));

	if (removed.length > 0) {
		console.warn(
			`[dead-functions] ${removed.length} baseline entr${removed.length === 1 ? "y is" : "ies are"} no longer dead (fixed). Update the baseline:\n` +
				removed.map((f) => `  - ${f.key}`).join("\n") +
				"\n  Run: UPDATE_DEADFUNCTIONS_BASELINE=1 npx vitest --run test/dead-functions.test.ts",
		);
	}

	expect(
		newDead,
		`New dead functions detected (${newDead.length}). Delete them, or accept them into the baseline with:\n` +
			`  UPDATE_DEADFUNCTIONS_BASELINE=1 npx vitest --run test/dead-functions.test.ts\n\n` +
			(newDead.length ? `New dead functions:\n${newDead.map(formatEntry).join("\n")}` : ""),
	).toHaveLength(0);
});
