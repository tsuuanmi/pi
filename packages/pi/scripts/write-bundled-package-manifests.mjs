/**
 * Writes dist-correct package.json manifests for the bundled packages.
 *
 * Bundled package source manifests may point at workspace source files. The
 * workflows bundle is flattened into dist/packages/workflows, so its manifest
 * needs `src/` removed and `.ts` changed to `.js`. The web-runtime bundle keeps
 * its compiled `dist/` directory, so its compiled manifest paths are preserved.
 *
 * This script reads each bundled package's source manifest and writes the result
 * so the dist package.json matches the bundled layout. Run from the pi package
 * dir. Pass package names to rewrite a subset (default: all packages).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const PACKAGES = {
	workflows: { src: "../workflows/package.json", dest: "dist/packages/workflows/package.json", flatten: true },
	"web-runtime": { src: "../web-runtime/package.json", dest: "dist/packages/web-runtime/package.json", flatten: false },
};

const names = process.argv.slice(2);
const targets = names.length > 0 ? names : Object.keys(PACKAGES);

function rewriteEntry(entry) {
	let p = typeof entry === "string" && entry.startsWith("src/") ? entry.slice(4) : entry;
	if (typeof p === "string" && p.startsWith("./dist/")) {
		p = `./${p.slice(7)}`;
	}
	if (typeof p === "string" && p.endsWith(".ts") && !p.endsWith(".d.ts")) {
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
	if (!cfg.flatten) {
		writeFileSync(resolve(cfg.dest), `${JSON.stringify(pkg, null, "\t")}\n`);
		console.log(`Wrote bundled ${name} package.json with dist manifest`);
		continue;
	}
	if (pkg.pi && typeof pkg.pi === "object") {
		pkg.pi = Object.fromEntries(
			Object.entries(pkg.pi).map(([key, value]) => [
				key,
				Array.isArray(value) ? value.map(rewriteEntry) : value,
			]),
		);
	}
	if (pkg.exports && typeof pkg.exports === "object") {
		pkg.exports = rewriteImports(pkg.exports);
	}
	if (pkg.imports && typeof pkg.imports === "object") {
		pkg.imports = rewriteImports(pkg.imports);
	}
	writeFileSync(resolve(cfg.dest), `${JSON.stringify(pkg, null, "\t")}\n`);
	console.log(`Wrote bundled ${name} package.json with dist manifest`);
}