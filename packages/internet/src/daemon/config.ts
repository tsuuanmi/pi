import { randomBytes } from "node:crypto";
import { chmod, mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { InternetAccount } from "#internet/core/types";

const CONFIG_VERSION = 3;
const APP_NAME = "Codex Native2";

export interface OwnedDaemonConfig {
	version: 3;
	releaseVersion: string;
	mode: "browser-only";
	host: "127.0.0.1";
	port: number;
	contextWindow: number;
	appName: string;
	browserHost: "managed-chrome";
	chromeExecutablePath: string;
	storageStatePath: string;
	brokerSocketPath: string;
	headed: true;
	solAvailable: boolean;
	proAvailable: boolean;
	autoApproveToolCalls: false;
	controlToken: string;
	runtimeCommand: string[];
	acknowledgedUnofficialAt: string;
}

export interface OwnedDaemonConfigOptions {
	chromeExecutablePath?: string;
	releaseVersion?: string;
	runtimeCommand?: string[];
}

export function daemonConfigPath(account: InternetAccount): string {
	return join(account.configDir, "config.json");
}

export function daemonLoginMarkerPath(account: InternetAccount): string {
	return `${join(account.configDir, "browser", "storage-state.json")}.verified.json`;
}

export async function daemonLoginExists(account: InternetAccount): Promise<boolean> {
	try {
		const marker = JSON.parse(await readFile(daemonLoginMarkerPath(account), "utf8")) as Record<string, unknown>;
		if (marker.authenticated !== true) return false;
		if (marker.version === 1) return typeof marker.verifiedAt === "string";
		return (
			marker.version === 2 &&
			marker.source === "authenticated-system-browser" &&
			typeof marker.capturedAt === "string"
		);
	} catch {
		return false;
	}
}

export async function syncOwnedDaemonCapabilities(account: InternetAccount): Promise<void> {
	const path = daemonConfigPath(account);
	const config = JSON.parse(await readFile(path, "utf8")) as OwnedDaemonConfig;
	validateOwnedConfig(config, account);
	const marker = JSON.parse(await readFile(daemonLoginMarkerPath(account), "utf8")) as Record<string, unknown>;
	const solAvailable = marker.solAvailable === true;
	const proAvailable = solAvailable && marker.proAvailable === true;
	if (config.solAvailable === solAvailable && config.proAvailable === proAvailable) return;
	await writePrivateJson(path, { ...config, solAvailable, proAvailable });
}

export async function ensureOwnedDaemonConfig(
	account: InternetAccount,
	options: OwnedDaemonConfigOptions = {},
): Promise<OwnedDaemonConfig> {
	const path = daemonConfigPath(account);
	try {
		const existing = JSON.parse(await readFile(path, "utf8")) as OwnedDaemonConfig;
		validateOwnedConfig(existing, account);
		return existing;
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
	}

	const runtimeCommand = options.runtimeCommand;
	if (!runtimeCommand?.length) throw new Error("The bundled ChatGPT Web runtime command is required.");
	const releaseVersion = options.releaseVersion;
	if (!releaseVersion) throw new Error("The bundled ChatGPT Web runtime version is required.");
	const chromeExecutablePath = options.chromeExecutablePath ?? "/usr/bin/google-chrome";
	const config: OwnedDaemonConfig = {
		version: CONFIG_VERSION,
		releaseVersion,
		mode: "browser-only",
		host: "127.0.0.1",
		port: account.port,
		contextWindow: 256_000,
		appName: APP_NAME,
		browserHost: "managed-chrome",
		chromeExecutablePath,
		storageStatePath: join(account.configDir, "browser", "storage-state.json"),
		brokerSocketPath: join(account.configDir, "runtime", "turn-broker.sock"),
		headed: true,
		solAvailable: true,
		proAvailable: false,
		autoApproveToolCalls: false,
		controlToken: randomBytes(32).toString("base64url"),
		runtimeCommand,
		acknowledgedUnofficialAt: new Date().toISOString(),
	};
	await writePrivateJson(path, config);
	return config;
}

function validateOwnedConfig(config: OwnedDaemonConfig, account: InternetAccount): void {
	if (config.version !== CONFIG_VERSION || config.mode !== "browser-only") {
		throw new Error(`Unsupported owned daemon configuration: ${daemonConfigPath(account)}`);
	}
	if (config.host !== "127.0.0.1" || config.port !== account.port) {
		throw new Error(`Owned daemon endpoint does not match account ${account.id}.`);
	}
	if (!/^[A-Za-z0-9_-]{40,}$/.test(config.controlToken)) {
		throw new Error(`Invalid owned daemon control token: ${daemonConfigPath(account)}`);
	}
}

async function writePrivateJson(path: string, value: unknown): Promise<void> {
	const directory = dirname(path);
	await mkdir(directory, { recursive: true, mode: 0o700 });
	await chmod(directory, 0o700);
	const temporary = `${path}.${process.pid}.${Date.now()}.tmp`;
	await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
	await rename(temporary, path);
	await chmod(path, 0o600);
	const metadata = await stat(path);
	if ((metadata.mode & 0o777) !== 0o600) throw new Error(`Could not secure owned daemon config: ${path}`);
}
