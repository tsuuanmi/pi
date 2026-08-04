import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { normalizePath } from "@tsuuanmi/pi-agent/node";

interface PackageJson {
	name?: string;
	version?: string;
	piConfig?: {
		name?: string;
		configDir?: string;
	};
}

const moduleDir = dirname(fileURLToPath(import.meta.url));

export function getPackageDir(): string {
	const envDir = process.env.PI_PACKAGE_DIR;
	if (envDir) return normalizePath(envDir);

	let dir = moduleDir;
	while (dir !== dirname(dir)) {
		if (existsSync(join(dir, "package.json"))) return dir;
		dir = dirname(dir);
	}
	return moduleDir;
}

let packageJson: PackageJson = {};
try {
	packageJson = JSON.parse(readFileSync(join(getPackageDir(), "package.json"), "utf-8")) as PackageJson;
} catch (error: unknown) {
	const err = error as NodeJS.ErrnoException;
	if (err.code !== "ENOENT") throw error;
}

const configuredName = packageJson.piConfig?.name;

export const PACKAGE_NAME = packageJson.name || "@tsuuanmi/pi";
export const APP_NAME = configuredName || "pi";
export const APP_TITLE = configuredName ? APP_NAME : "π";
export const CONFIG_DIR_NAME = packageJson.piConfig?.configDir || ".pi";
export const VERSION = packageJson.version || "0.0.0";
export const ENV_AGENT_DIR = `${APP_NAME.toUpperCase()}_AGENT_DIR`;
export const ENV_SESSION_DIR = `${APP_NAME.toUpperCase()}_SESSION_DIR`;
