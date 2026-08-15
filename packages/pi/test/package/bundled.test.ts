import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { getBundledPackages } from "#pi/package/bundled";

const roots: string[] = [];

function createBundledRoot(): string {
	const root = mkdtempSync(join(tmpdir(), "pi-bundled-packages-"));
	roots.push(root);
	return root;
}

function createPackage(root: string, name: string, pi: Record<string, unknown>, compiled = false): string {
	const packageRoot = join(root, name);
	mkdirSync(packageRoot, { recursive: true });
	if (compiled) mkdirSync(join(packageRoot, "dist"));
	writeFileSync(join(packageRoot, "package.json"), JSON.stringify({ pi }));
	return packageRoot;
}

afterEach(() => {
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("bundled packages", () => {
	it("discovers compiled packages from their manifests", () => {
		const packages = getBundledPackages();

		expect(packages.length).toBeGreaterThan(0);
		for (const pkg of packages) {
			expect(pkg.name).toBe(basename(pkg.root));
			expect(pkg.source).toBe(`pi:${pkg.name}`);
			expect(existsSync(join(pkg.root, "dist"))).toBe(true);
			expect(JSON.parse(readFileSync(join(pkg.root, "package.json"), "utf8"))).toHaveProperty("pi");
		}
	});

	it("skips an explicitly optional package without compiled output", () => {
		const root = createBundledRoot();
		createPackage(root, "internet", { bundleOptional: true, extensions: ["dist/extension.js"] });

		expect(getBundledPackages(root)).toEqual([]);
	});

	it("rejects a required package without compiled output", () => {
		const root = createBundledRoot();
		const packageRoot = createPackage(root, "workflows", { extensions: ["dist/extension.js"] });

		expect(() => getBundledPackages(root)).toThrow(`Bundled package has no compiled dist: ${packageRoot}`);
	});
});
