/**
 * Writes dist-correct package.json manifests for the bundled packages.
 *
 * Bundled package source manifests declare `src/`-prefixed `.ts` paths because
 * the dev package roots are the workspace source dirs (e.g. the workflows
 * extension is src/extensions/workflows.ts). When bundled into pi-coding-agent,
 * copy-assets flattens the compiled output into dist/packages/<name> with no
 * `src/` segment and `.js` extensions (e.g. dist/packages/workflows/extensions/
 * workflows.js). The verbatim source manifest would resolve to non-existent
 * paths and load nothing in the published dist.
 *
 * This script reads each bundled package's source manifest, strips a leading
 * `src/` and maps `.ts` to `.js`, and writes the result so the dist
 * package.json matches the actual bundled layout. Dev keeps using the source
 * manifests directly, so no runtime fallback is needed. Run from the
 * pi-coding-agent package dir. Pass package names to rewrite a subset
 * (default: all of lsp, mcp, workflows).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const PACKAGES = {
	lsp: { src: "src/packages/lsp/package.json", dest: "dist/packages/lsp/package.json" },
	mcp: { src: "src/packages/mcp/package.json", dest: "dist/packages/mcp/package.json" },
	workflows: { src: "../workflows/package.json", dest: "dist/packages/workflows/package.json" },
};

const names = process.argv.slice(2);
const targets = names.length > 0 ? names : Object.keys(PACKAGES);

function rewriteEntry(entry) {
	let p = typeof entry === "string" && entry.startsWith("src/") ? entry.slice(4) : entry;
	if (typeof p === "string" && p.startsWith("./dist/")) {
		p = `./${p.slice(7)}`;
	}
	if (typeof p === "string" && p.endsWith(".ts")) {
		p = `${p.slice(0, -3)}.js`;
	}
	return p;
}

function rewriteImports(value) {
	if (typeof value === "string") return rewriteEntry(value);
	if (Array.isArray(value)) return value.map(rewriteImports);
	if (value && typeof value === "object") {
		return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, rewriteImports(entry)]));
	}
	return value;
}

for (const name of targets) {
	const cfg = PACKAGES[name];
	if (!cfg) {
		throw new Error(`Unknown bundled package: ${name}. Known: ${Object.keys(PACKAGES).join(", ")}`);
	}
	const pkg = JSON.parse(readFileSync(resolve(cfg.src), "utf8"));
	if (pkg.pi && typeof pkg.pi === "object") {
		pkg.pi = Object.fromEntries(
			Object.entries(pkg.pi).map(([key, value]) => [
				key,
				Array.isArray(value) ? value.map(rewriteEntry) : value,
			]),
		);
	}
	if (pkg.imports && typeof pkg.imports === "object") {
		pkg.imports = rewriteImports(pkg.imports);
	}
	writeFileSync(resolve(cfg.dest), `${JSON.stringify(pkg, null, "\t")}\n`);
	console.log(`Wrote bundled ${name} package.json with dist manifest`);
}