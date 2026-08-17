import { EventEmitter } from "node:events";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AccountRegistry } from "#internet/accounts/registry";
import type { OpenAiInternetAccount } from "#internet/core/types";
import { DaemonClient } from "#internet/daemon/client";
import { daemonConfigFingerprint, daemonLoginMarkerPath, ensureOwnedDaemonConfig } from "#internet/daemon/config";
import { OwnedDaemonManager } from "#internet/daemon/manager";

async function account(): Promise<OpenAiInternetAccount> {
	const configDir = await mkdtemp(join(tmpdir(), "pi-internet-manager-"));
	return {
		id: "default",
		provider: "openai",
		displayName: "ChatGPT Web",
		configDir,
		host: "127.0.0.1",
		port: 17841,
		enabled: true,
	};
}

function authenticatedMarker() {
	return {
		version: 2,
		authenticated: true,
		verifiedAt: new Date().toISOString(),
		proAvailable: false,
	};
}

describe("OwnedDaemonManager", () => {
	it("adopts a healthy account without spawning and can shut it down", async () => {
		const target = await account();
		await mkdir(join(target.configDir, "browser"));
		await writeFile(daemonLoginMarkerPath(target), JSON.stringify(authenticatedMarker()));
		const config = await ensureOwnedDaemonConfig(target, {
			releaseVersion: "0.1.0",
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
				manifest: { schemaVersion: 1, appVersion: "0.1.0", platform: "linux", arch: "x64", launcher: "bin/daemon" },
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
				manifest: { schemaVersion: 1, appVersion: "0.1.0", platform: "linux", arch: "x64", launcher: "bin/daemon" },
			},
			spawn: spawn as never,
			waitForHealth: vi.fn(async () => {}),
		});
		await Promise.all([manager.start(target.id), manager.start(target.id)]);
		expect(spawn).toHaveBeenCalledOnce();
	});

	it("passes an absolute storage-state import path to daemon-owned login", async () => {
		const target = await account();
		const child = Object.assign(new EventEmitter(), { exitCode: null as number | null });
		const spawn = vi.fn(() => {
			queueMicrotask(async () => {
				await mkdir(join(target.configDir, "browser"), { recursive: true });
				await writeFile(join(target.configDir, "browser", "storage-state.json"), "{}\n");
				await writeFile(daemonLoginMarkerPath(target), JSON.stringify(authenticatedMarker()));
				child.emit("exit", 0, null);
			});
			return child;
		});
		const manager = new OwnedDaemonManager([target], {
			runtime: {
				root: "/runtime",
				launcher: "/runtime/bin/daemon",
				manifest: { schemaVersion: 1, appVersion: "0.1.0", platform: "linux", arch: "x64", launcher: "bin/daemon" },
			},
			spawn: spawn as never,
		});
		await manager.login(target.id, { storageStatePath: "browser-state.json" });
		expect(spawn).toHaveBeenCalledWith(
			"/runtime/bin/daemon",
			["--home", target.configDir, "login", "--import-storage-state", join(process.cwd(), "browser-state.json")],
			expect.any(Object),
		);
	});

	it("uses the current default account path", async () => {
		const registry = new AccountRegistry(
			join(await mkdtemp(join(tmpdir(), "pi-internet-registry-")), "accounts.json"),
		);
		await expect(registry.getOpenAi()).resolves.toMatchObject({ id: "default" });
	});
});
