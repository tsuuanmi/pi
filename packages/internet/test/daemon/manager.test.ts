import { EventEmitter } from "node:events";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AccountRegistry } from "#internet/accounts/registry";
import { DaemonClient } from "#internet/backends/openai/daemon/client";
import type { InternetAccount } from "#internet/core/types";
import { daemonConfigFingerprint, daemonLoginMarkerPath, ensureOwnedDaemonConfig } from "#internet/daemon/config";
import { OwnedDaemonManager } from "#internet/daemon/manager";

async function account(): Promise<InternetAccount> {
	const configDir = await mkdtemp(join(tmpdir(), "pi-internet-manager-"));
	return {
		id: "default",
		backend: "openai",
		displayName: "ChatGPT Web",
		configDir,
		host: "127.0.0.1",
		port: 17841,
		enabled: true,
		conversationMode: "temporary",
	};
}

function authenticatedMarker() {
	return {
		version: 2,
		authenticated: true,
		source: "authenticated-system-browser",
		capturedAt: new Date().toISOString(),
		solAvailable: true,
		proAvailable: false,
	};
}

describe("OwnedDaemonManager", () => {
	it("adopts a healthy account without spawning and can shut it down", async () => {
		const target = await account();
		await mkdir(join(target.configDir, "browser"));
		await writeFile(daemonLoginMarkerPath(target), JSON.stringify(authenticatedMarker()));
		const config = await ensureOwnedDaemonConfig(target, {
			releaseVersion: "2.1.8",
			runtimeCommand: ["/runtime/bin/daemon"],
		});
		const health = vi.fn(async () => ({ status: "ok", config_fingerprint: daemonConfigFingerprint(config) }));
		const control = vi.fn(async () => ({ status: "ok" }));
		vi.spyOn(DaemonClient, "forAccount").mockResolvedValue({ health, control } as unknown as DaemonClient);
		const spawn = vi.fn();
		const manager = new OwnedDaemonManager([target], {
			runtime: {
				root: "/runtime",
				launcher: "/runtime/bin/daemon",
				manifest: { schemaVersion: 1, appVersion: "2.1.8", platform: "linux", arch: "x64", launcher: "bin/daemon" },
			},
			spawn: spawn as never,
		});
		await manager.start(target.id);
		expect(spawn).not.toHaveBeenCalled();
		await expect(manager.status(target.id)).resolves.toMatchObject([{ state: "running", owned: false }]);
		expect(control).not.toHaveBeenCalled();
		await manager.stop(target.id);
		expect(control).toHaveBeenCalledWith("shutdown");
	});

	it("serializes concurrent starts into one child process", async () => {
		const target = await account();
		const child = Object.assign(new EventEmitter(), {
			pid: 123,
			exitCode: null as number | null,
			killed: false,
			kill: vi.fn(() => true),
			unref: vi.fn(),
		});
		const health = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue({ status: "ok" });
		vi.spyOn(DaemonClient, "forAccount").mockResolvedValue({ health } as unknown as DaemonClient);
		const spawn = vi.fn(() => child);
		const manager = new OwnedDaemonManager([target], {
			runtime: {
				root: "/runtime",
				launcher: "/runtime/bin/daemon",
				manifest: { schemaVersion: 1, appVersion: "2.1.8", platform: "linux", arch: "x64", launcher: "bin/daemon" },
			},
			spawn: spawn as never,
			waitForHealth: vi.fn(async () => {}),
		});
		await Promise.all([manager.start(target.id), manager.start(target.id)]);
		expect(spawn).toHaveBeenCalledOnce();
	});

	it("uses the current default account path", async () => {
		const registry = new AccountRegistry({
			path: join(await mkdtemp(join(tmpdir(), "pi-internet-registry-")), "accounts.json"),
		});
		await expect(registry.get()).resolves.toMatchObject({ id: "default" });
	});
});
