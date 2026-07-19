import { chmodSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import type { BundledPackageName } from "#coding-agent/core/package-manager/types";

export function getEnv(): NodeJS.ProcessEnv {
	if (process.platform !== "linux" || Object.keys(process.env).length > 0) {
		return process.env;
	}
	try {
		const data = readFileSync("/proc/self/environ", "utf-8");
		const env: NodeJS.ProcessEnv = {};
		for (const entry of data.split("\0")) {
			const idx = entry.indexOf("=");
			if (idx > 0) {
				env[entry.slice(0, idx)] = entry.slice(idx + 1);
			}
		}
		return env;
	} catch {
		return process.env;
	}
}

export function isOfflineModeEnabled(): boolean {
	const value = process.env.PI_OFFLINE;
	if (!value) return false;
	return value === "1" || value.toLowerCase() === "true" || value.toLowerCase() === "yes";
}

export function toPosixPath(p: string): string {
	return p.split(sep).join("/");
}

export function getHomeDir(): string {
	return process.env.HOME || homedir();
}

export function getExtensionTempFolder(agentDir: string): string {
	const tempFolder = join(agentDir, "tmp", "extensions");
	mkdirSync(tempFolder, { recursive: true, mode: 0o700 });
	chmodSync(tempFolder, 0o700);
	return tempFolder;
}

export function getBundledPackageRoot(name: BundledPackageName): string {
	// "workflows" is now a standalone workspace package at packages/workflows/src/,
	// not an embedded package under src/packages/. Other bundled
	// packages (lsp, mcp, providers) remain under src/packages/.
	if (name === "workflows") {
		const __dirname = dirname(fileURLToPath(import.meta.url));
		// Dev: the workflows package is a workspace sibling at packages/workflows
		// (source layout with src/). Published dist bundles it flattened under
		// .../packages/workflows (compiled .js, no src/), same as lsp/mcp/providers.
		const devWorkspace = resolve(__dirname, "..", "..", "..", "..", "workflows");
		if (existsSync(resolve(devWorkspace, "package.json"))) {
			return devWorkspace;
		}
		return resolve(__dirname, "..", "..", "packages", "workflows");
	}
	return resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "packages", name);
}
