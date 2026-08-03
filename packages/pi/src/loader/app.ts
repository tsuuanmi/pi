import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getPackageDir } from "#pi/loader/package";

interface PackageJson {
	name?: string;
	version?: string;
	piConfig?: {
		name?: string;
		configDir?: string;
	};
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
