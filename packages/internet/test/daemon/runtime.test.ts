import { chmod, mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { resolveDaemonRuntime } from "#internet/daemon/runtime";

describe("resolveDaemonRuntime", () => {
	it("resolves a matching executable bundled beside the package output", async () => {
		const root = await mkdtemp(join(tmpdir(), "pi-internet-runtime-"));
		const moduleDir = join(root, "src", "daemon");
		const runtimeDir = join(root, "src", "daemon", "runtime");
		await mkdir(join(runtimeDir, "bin"), { recursive: true });
		await writeFile(
			join(runtimeDir, "manifest.json"),
			JSON.stringify({
				schemaVersion: 1,
				appVersion: "2.1.8",
				platform: "linux",
				arch: "x64",
				launcher: "bin/codex-chatgpt-web",
			}),
		);
		await writeFile(join(runtimeDir, "bin", "codex-chatgpt-web"), "#!/bin/sh\n");
		await chmod(join(runtimeDir, "bin", "codex-chatgpt-web"), 0o755);
		const runtime = await resolveDaemonRuntime({
			platform: "linux",
			arch: "x64",
			moduleUrl: pathToFileURL(join(moduleDir, "runtime.js")).href,
		});
		expect(runtime.launcher).toBe(join(runtimeDir, "bin", "codex-chatgpt-web"));
	});

	it("rejects unsupported operating systems", async () => {
		await expect(resolveDaemonRuntime({ platform: "darwin" })).rejects.toThrow("supports Linux only");
	});
});
