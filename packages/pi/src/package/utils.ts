import { chmodSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validRange } from "semver";
import type { PackageSource } from "#pi/settings/types";
import type { BundledPackageName } from "./types.ts";

export const BUNDLED_PACKAGE_SOURCES: Record<string, BundledPackageName> = {
	"pi:workflows": "workflows",
};

export const BUNDLED_DEFAULT_PACKAGES: PackageSource[] = ["pi:workflows"];

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

export function getExtensionTempFolder(agentDir: string): string {
	const tempFolder = join(agentDir, "tmp", "extensions");
	mkdirSync(tempFolder, { recursive: true, mode: 0o700 });
	chmodSync(tempFolder, 0o700);
	return tempFolder;
}

export function getBundledPackageRoot(name: BundledPackageName): string {
	const __dirname = dirname(fileURLToPath(import.meta.url));
	const bundledDist = resolve(__dirname, "..", "packages", name);
	if (existsSync(resolve(bundledDist, "package.json"))) return bundledDist;
	// Dev: workspace siblings use source layout until their package is built.
	const devWorkspace = resolve(__dirname, "..", "..", "..", name);
	if (existsSync(resolve(devWorkspace, "package.json"))) return devWorkspace;
	return bundledDist;
}

export function getNpmVersionRange(version: string | undefined): string | undefined {
	return version ? (validRange(version) ?? undefined) : undefined;
}
