import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { disableFullHarness, enableFullHarness, readHarnessConfig } from "#internet/daemon/harness";

function account(configDir: string) {
	return { id: "default", configDir } as never;
}

describe("Full harness configuration", () => {
	it("copies the runtime key into private account state", async () => {
		const configDir = await mkdtemp(join(tmpdir(), "pi-internet-harness-"));
		const tunnelClientPath = join(configDir, "tunnel-client");
		const runtimeKeyFile = join(configDir, "source-key");
		await writeFile(tunnelClientPath, "#!/bin/sh\n", { mode: 0o700 });
		await writeFile(runtimeKeyFile, "secret-key\n", { mode: 0o600 });
		const result = await enableFullHarness(account(configDir), {
			tunnelClientPath,
			tunnelId: `tunnel_${"a".repeat(32)}`,
			runtimeKeyFile,
		});
		expect(result).toMatchObject({ mode: "full", tunnelClientPath, tunnelId: `tunnel_${"a".repeat(32)}` });
		if (result.mode !== "full") throw new Error("expected full mode");
		expect(await readFile(result.runtimeKeyFile, "utf8")).toBe("secret-key\n");
		expect((await stat(result.runtimeKeyFile)).mode & 0o777).toBe(0o600);
		expect(await readHarnessConfig(account(configDir))).toEqual(result);
	});

	it("defaults to browser-only and disables Full mode", async () => {
		const configDir = await mkdtemp(join(tmpdir(), "pi-internet-harness-"));
		await expect(readHarnessConfig(account(configDir))).resolves.toEqual({ mode: "browser-only" });
		await expect(disableFullHarness(account(configDir))).resolves.toEqual({ mode: "browser-only" });
	});
});
