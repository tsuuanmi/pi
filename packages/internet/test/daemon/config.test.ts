import { mkdir, mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { InternetAccount } from "#internet/core/types";
import {
	daemonLoginExists,
	daemonLoginMarkerPath,
	ensureOwnedDaemonConfig,
	readOwnedDaemonCapabilities,
} from "#internet/daemon/config";

function account(configDir: string): InternetAccount {
	return {
		id: "default",
		backend: "openai",
		displayName: "ChatGPT Web",
		configDir,
		host: "127.0.0.1",
		port: 17841,
		enabled: true,
	};
}

describe("owned daemon config", () => {
	it("uses the daemon's default Sol capability before config exists", async () => {
		const configDir = await mkdtemp(join(tmpdir(), "pi-internet-capabilities-missing-"));
		await expect(readOwnedDaemonCapabilities(account(configDir))).resolves.toEqual({
			solAvailable: true,
			proAvailable: false,
		});
	});

	it("creates a private loopback config with an isolated browser profile", async () => {
		const configDir = await mkdtemp(join(tmpdir(), "pi-internet-config-"));
		const created = await ensureOwnedDaemonConfig(account(configDir), {
			releaseVersion: "2.1.8",
			runtimeCommand: ["/runtime/bin/daemon"],
		});
		expect(created).toMatchObject({
			mode: "browser-only",
			host: "127.0.0.1",
			port: 17841,
			browserHost: "managed-chrome",
			runtimeCommand: ["/runtime/bin/daemon"],
		});
		expect(created.storageStatePath).toBe(join(configDir, "browser", "storage-state.json"));
		expect((await stat(join(configDir, "config.json"))).mode & 0o777).toBe(0o600);
		expect(JSON.parse(await readFile(join(configDir, "config.json"), "utf8"))).toEqual(created);
	});

	it("reads model capabilities from the owned daemon config", async () => {
		const configDir = await mkdtemp(join(tmpdir(), "pi-internet-capabilities-"));
		const target = account(configDir);
		await ensureOwnedDaemonConfig(target, {
			releaseVersion: "2.1.8",
			runtimeCommand: ["/runtime/bin/daemon"],
		});
		await expect(readOwnedDaemonCapabilities(target)).resolves.toEqual({
			solAvailable: true,
			proAvailable: false,
		});
	});

	it("recognizes only the verified durable login format", async () => {
		const configDir = await mkdtemp(join(tmpdir(), "pi-internet-login-"));
		const target = account(configDir);
		const browserDir = join(configDir, "browser");
		await expect(daemonLoginExists(target)).resolves.toBe(false);
		await mkdir(browserDir);
		await writeFile(
			daemonLoginMarkerPath(target),
			JSON.stringify({
				version: 2,
				authenticated: true,
				source: "authenticated-system-browser",
				capturedAt: new Date().toISOString(),
			}),
		);
		await writeFile(join(browserDir, "storage-state.json"), "{}\n");
		await expect(daemonLoginExists(target)).resolves.toBe(false);
		await writeFile(
			daemonLoginMarkerPath(target),
			JSON.stringify({ version: 1, authenticated: true, verifiedAt: new Date().toISOString() }),
		);
		await expect(daemonLoginExists(target)).resolves.toBe(true);
	});
});
