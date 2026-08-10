import { existsSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { describe, expect, it } from "vitest";
import { getBundledPackages } from "#pi/package/bundled";

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
});
