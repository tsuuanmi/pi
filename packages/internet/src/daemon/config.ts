import { createHash, randomBytes } from "node:crypto";
import { chmod, mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { InternetAccount } from "#internet/core/types";
import { readHarnessConfig } from "#internet/daemon/harness";

const CONFIG_VERSION = 3;
const APP_NAME = "Codex Native2";
const BROWSER_IDLE_SHUTDOWN_MS = 5 * 60 * 1_000;
const BROWSER_WINDOW_WIDTH = 900;
const BROWSER_WINDOW_HEIGHT = 700;

interface OwnedTunnelConfig {
	binaryPath: string;
	tunnelId: string;
	runtimeKeyFile: string;
	profileDir: string;
	profileName: string;
	alias: string;
}

export interface OwnedDaemonConfig {
	version: 3;
	releaseVersion: string;
	mode: "browser-only" | "full";
	host: "127.0.0.1";
	port: number;
	contextWindow: number;
	appName: string;
	browserHost: "managed-chrome";
	chromeExecutablePath: string;
	storageStatePath: string;
	brokerSocketPath: string;
	headed: true;
	browserWindowWidth: number;
	browserWindowHeight: number;
	idleShutdownMs: number;
	solAvailable: boolean;
	proAvailable: boolean;
	autoApproveToolCalls: false;
	controlToken: string;
	runtimeCommand: string[];
	acknowledgedUnofficialAt: string;
	tunnel?: OwnedTunnelConfig;
}

export interface OwnedDaemonConfigOptions {
	chromeExecutablePath?: string;
	releaseVersion?: string;
	runtimeCommand?: string[];
}

export interface DaemonCapabilities {
	solAvailable: boolean;
	proAvailable: boolean;
}

export function daemonConfigFingerprint(config: OwnedDaemonConfig): string {
	return createHash("sha256").update(JSON.stringify(config)).digest("hex");
}

export function daemonConfigPath(account: InternetAccount): string {
	return join(account.configDir, "config.json");
}

export function daemonLoginMarkerPath(account: InternetAccount): string {
	return `${join(account.configDir, "browser", "storage-state.json")}.verified.json`;
}

export async function daemonLoginExists(account: InternetAccount): Promise<boolean> {
	try {
		await stat(join(account.configDir, "browser", "storage-state.json"));
		const marker = JSON.parse(await readFile(daemonLoginMarkerPath(account), "utf8")) as Record<string, unknown>;
		return marker.version === 1 && marker.authenticated === true && typeof marker.verifiedAt === "string";
	} catch {
		return false;
	}
}

export async function readOwnedDaemonCapabilities(account: InternetAccount): Promise<DaemonCapabilities> {
	try {
		const config = JSON.parse(await readFile(daemonConfigPath(account), "utf8")) as OwnedDaemonConfig;
		validateOwnedConfig(config, account);
		return { solAvailable: config.solAvailable, proAvailable: config.proAvailable };
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return { solAvailable: true, proAvailable: false };
		throw error;
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
	const harness = await readHarnessConfig(account);
	let existing: OwnedDaemonConfig | undefined;
	try {
		existing = JSON.parse(await readFile(path, "utf8")) as OwnedDaemonConfig;
		validateOwnedConfig(existing, account);
		const harnessMatches =
			harness.mode === "browser-only"
				? existing.mode === "browser-only" && existing.tunnel === undefined
				: existing.mode === "full" &&
					existing.tunnel?.binaryPath === harness.tunnelClientPath &&
					existing.tunnel.tunnelId === harness.tunnelId &&
					existing.tunnel.runtimeKeyFile === harness.runtimeKeyFile;
		if (
			harnessMatches &&
			existing.browserWindowWidth === BROWSER_WINDOW_WIDTH &&
			existing.browserWindowHeight === BROWSER_WINDOW_HEIGHT &&
			existing.idleShutdownMs === BROWSER_IDLE_SHUTDOWN_MS
		) {
			return existing;
		}
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
	}

	const runtimeCommand = options.runtimeCommand ?? existing?.runtimeCommand;
	if (!runtimeCommand?.length) throw new Error("The bundled ChatGPT Web runtime command is required.");
	const releaseVersion = options.releaseVersion ?? existing?.releaseVersion;
	if (!releaseVersion) throw new Error("The bundled ChatGPT Web runtime version is required.");
	const chromeExecutablePath =
		options.chromeExecutablePath ?? existing?.chromeExecutablePath ?? "/usr/bin/google-chrome";
	const config: OwnedDaemonConfig = {
		version: CONFIG_VERSION,
		releaseVersion,
		mode: harness.mode,
		host: "127.0.0.1",
		port: account.port,
		contextWindow: 256_000,
		appName: APP_NAME,
		browserHost: "managed-chrome",
		chromeExecutablePath,
		storageStatePath: join(account.configDir, "browser", "storage-state.json"),
		brokerSocketPath: join(account.configDir, "runtime", "turn-broker.sock"),
		headed: true,
		browserWindowWidth: BROWSER_WINDOW_WIDTH,
		browserWindowHeight: BROWSER_WINDOW_HEIGHT,
		idleShutdownMs: BROWSER_IDLE_SHUTDOWN_MS,
		solAvailable: existing?.solAvailable ?? true,
		proAvailable: existing?.proAvailable ?? false,
		autoApproveToolCalls: false,
		controlToken: existing?.controlToken ?? randomBytes(32).toString("base64url"),
		runtimeCommand,
		acknowledgedUnofficialAt: new Date().toISOString(),
		...(harness.mode === "full"
			? {
					tunnel: {
						binaryPath: harness.tunnelClientPath,
						tunnelId: harness.tunnelId,
						runtimeKeyFile: harness.runtimeKeyFile,
						profileDir: join(account.configDir, "tunnel", "profiles"),
						profileName: `pi-internet-${account.id}`,
						alias: `pi-internet-${account.id}`,
					},
				}
			: {}),
	};
	await writePrivateJson(path, config);
	return config;
}

function validateOwnedConfig(config: OwnedDaemonConfig, account: InternetAccount): void {
	if (config.version !== CONFIG_VERSION || (config.mode !== "browser-only" && config.mode !== "full")) {
		throw new Error(`Unsupported owned daemon configuration: ${daemonConfigPath(account)}`);
	}
	if (config.mode === "full" && !config.tunnel) {
		throw new Error(`Full harness configuration is missing tunnel settings: ${daemonConfigPath(account)}`);
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
