import { chmod, mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { resolveDaemonRuntime } from "#internet/daemon/runtime";

async function runtime(platform: "linux" | "darwin", arch: "x64" | "arm64", launcher = "bin/pi-internet-runtime") {
	const root = await mkdtemp(join(tmpdir(), "pi-internet-runtime-"));
	const moduleDir = join(root, "src", "daemon");
	const runtimeDir = join(moduleDir, "runtime");
	await mkdir(join(runtimeDir, "bin"), { recursive: true });
	await writeFile(
		join(runtimeDir, "manifest.json"),
		JSON.stringify({ schemaVersion: 1, appVersion: "0.1.0", platform, arch, launcher }),
	);
	await writeFile(join(runtimeDir, "bin", "pi-internet-runtime"), "#!/bin/sh\n");
	await chmod(join(runtimeDir, "bin", "pi-internet-runtime"), 0o755);
	return pathToFileURL(join(moduleDir, "runtime.js")).href;
}

describe("resolveDaemonRuntime", () => {
	it.each([
		["linux", "x64"],
		["darwin", "arm64"],
	] as const)("resolves a matching %s-%s runtime", async (platform, arch) => {
		const moduleUrl = await runtime(platform, arch);
		await expect(resolveDaemonRuntime({ platform, arch, moduleUrl })).resolves.toMatchObject({
			manifest: { platform, arch },
		});
	});

	it("rejects unsupported operating systems and mismatched artifacts", async () => {
		await expect(resolveDaemonRuntime({ platform: "win32" })).rejects.toThrow("Linux and macOS only");
		const moduleUrl = await runtime("darwin", "arm64");
		await expect(resolveDaemonRuntime({ platform: "darwin", arch: "x64", moduleUrl })).rejects.toThrow("darwin-x64");
	});

	it("rejects launcher paths outside the runtime", async () => {
		const moduleUrl = await runtime("darwin", "arm64", "../outside");
		await expect(resolveDaemonRuntime({ platform: "darwin", arch: "arm64", moduleUrl })).rejects.toThrow(
			"escapes its runtime directory",
		);
	});
});
