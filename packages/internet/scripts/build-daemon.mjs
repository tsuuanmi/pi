import { chmod, cp, mkdir, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";
import process from "node:process";

const packageRoot = resolve(import.meta.dirname, "..");
const vendorRoot = join(packageRoot, "vendor", "codex-chatgpt-web");
const sourceRuntime = join(vendorRoot, "dist", "runtime");
const targetRuntime = join(packageRoot, "dist", "daemon", "runtime");

await run("bun", ["run", "scripts/build-runtime-bundle.ts"], vendorRoot);
await rm(targetRuntime, { recursive: true, force: true });
await mkdir(targetRuntime, { recursive: true });
await cp(sourceRuntime, targetRuntime, { recursive: true });
await cp(join(vendorRoot, "LICENSE"), join(targetRuntime, "LICENSE"));
await cp(join(vendorRoot, "SNAPSHOT.md"), join(targetRuntime, "SNAPSHOT.md"));
await chmod(join(targetRuntime, "bin", "codex-chatgpt-web"), 0o755);
await rm(join(vendorRoot, "dist"), { recursive: true, force: true });

function run(command, args, cwd) {
	return new Promise((resolveRun, rejectRun) => {
		const child = spawn(command, args, { cwd, stdio: "inherit" });
		child.once("error", rejectRun);
		child.once("exit", (code, signal) => {
			if (code === 0) resolveRun();
			else rejectRun(new Error(`${command} exited with ${signal ? `signal ${signal}` : `status ${code ?? "unknown"}`}.`));
		});
	});
}
