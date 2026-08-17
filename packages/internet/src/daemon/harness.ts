import { constants } from "node:fs";
import { access, chmod, copyFile, mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import type { BrowserInternetAccount } from "#internet/core/types";

export type HarnessConfig =
	| { mode: "browser-only" }
	| {
			mode: "full";
			tunnelClientPath: string;
			tunnelId: string;
			runtimeKeyFile: string;
	  };

const BROWSER_ONLY: HarnessConfig = { mode: "browser-only" };

export function harnessConfigPath(account: BrowserInternetAccount): string {
	return join(account.configDir, "harness.json");
}

export async function readHarnessConfig(account: BrowserInternetAccount): Promise<HarnessConfig> {
	try {
		const value = JSON.parse(await readFile(harnessConfigPath(account), "utf8")) as unknown;
		return validateHarnessConfig(value);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return BROWSER_ONLY;
		throw error;
	}
}

export async function enableFullHarness(
	account: BrowserInternetAccount,
	input: { tunnelClientPath: string; tunnelId: string; runtimeKeyFile: string },
): Promise<HarnessConfig> {
	if (account.provider === "gemini-web") throw new Error("Gemini Web accounts cannot enable Full harness mode.");
	const tunnelClientPath = resolve(input.tunnelClientPath);
	const sourceKeyPath = resolve(input.runtimeKeyFile);
	const tunnelId = input.tunnelId.trim();
	if (!/^tunnel_[a-f0-9]{32}$/.test(tunnelId)) {
		throw new Error("The tunnel ID must be tunnel_ followed by 32 lowercase hexadecimal characters.");
	}
	await access(tunnelClientPath, constants.X_OK);
	const keyStat = await stat(sourceKeyPath);
	if (!keyStat.isFile() || keyStat.size === 0 || keyStat.size > 64 * 1024) {
		throw new Error("The tunnel runtime key file must be a non-empty file no larger than 64 KiB.");
	}

	const runtimeKeyFile = join(account.configDir, "secrets", "tunnel-runtime.key");
	await mkdir(dirname(runtimeKeyFile), { recursive: true, mode: 0o700 });
	await copyFile(sourceKeyPath, runtimeKeyFile);
	await chmod(runtimeKeyFile, 0o600);
	const config: HarnessConfig = { mode: "full", tunnelClientPath, tunnelId, runtimeKeyFile };
	try {
		await writePrivateJson(harnessConfigPath(account), config);
		return config;
	} catch (error) {
		await rm(runtimeKeyFile, { force: true });
		throw error;
	}
}

export async function disableFullHarness(account: BrowserInternetAccount): Promise<HarnessConfig> {
	const current = await readHarnessConfig(account);
	await writePrivateJson(harnessConfigPath(account), BROWSER_ONLY);
	if (current.mode === "full") await rm(current.runtimeKeyFile, { force: true });
	return BROWSER_ONLY;
}

function validateHarnessConfig(value: unknown): HarnessConfig {
	if (!isRecord(value) || (value.mode !== "browser-only" && value.mode !== "full")) {
		throw new Error("Invalid internet harness configuration.");
	}
	if (value.mode === "browser-only") return BROWSER_ONLY;
	if (
		typeof value.tunnelClientPath !== "string" ||
		typeof value.tunnelId !== "string" ||
		typeof value.runtimeKeyFile !== "string" ||
		!value.tunnelClientPath ||
		!value.tunnelId ||
		!value.runtimeKeyFile
	) {
		throw new Error("Invalid Full harness configuration.");
	}
	return {
		mode: "full",
		tunnelClientPath: value.tunnelClientPath,
		tunnelId: value.tunnelId,
		runtimeKeyFile: value.runtimeKeyFile,
	};
}

async function writePrivateJson(path: string, value: unknown): Promise<void> {
	await mkdir(dirname(path), { recursive: true, mode: 0o700 });
	const temporary = `${path}.${process.pid}.${Date.now()}.tmp`;
	await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
	await rename(temporary, path);
	await chmod(path, 0o600);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
