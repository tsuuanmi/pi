import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { WebProviderHost } from "#pi/web-providers/host";

const directories: string[] = [];

afterEach(() => {
	for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe("WebProviderHost", () => {
	test("loads host-neutral descriptor modules and rejects invalid exports", async () => {
		const directory = mkdtempSync(join(tmpdir(), "pi-web-providers-"));
		directories.push(directory);
		const valid = join(directory, "valid.js");
		const worker = join(directory, "worker.js");
		const invalid = join(directory, "invalid.js");
		writeFileSync(
			valid,
			`module.exports = { id: "test-web", name: "Test Web", models: [], worker: "./worker", verify: async () => {}, runTurn: async () => {} };`,
		);
		writeFileSync(worker, "");
		writeFileSync(invalid, "module.exports = {};");

		const host = new WebProviderHost();
		await host.load([
			{ path: valid, enabled: true, metadata: { source: "test", scope: "temporary", origin: "package" } },
		]);
		expect(host.get("test-web")?.name).toBe("Test Web");

		await expect(
			host.load([
				{ path: invalid, enabled: true, metadata: { source: "test", scope: "temporary", origin: "package" } },
			]),
		).rejects.toThrow("failed to load web provider descriptors");
		expect(host.list()).toEqual([]);
	});
});
