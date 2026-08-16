import { createHash, randomBytes } from "node:crypto";
import { chmod, mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { OpenAiInternetAccount } from "#internet/core/types";
import { readHarnessConfig } from "#internet/daemon/harness";

const APP_NAME = "Codex Native2";
const OWNED_DAEMON_CONFIG_FIELDS = new Set([
	"releaseVersion",
	"mode",
	"host",
	"port",
	"contextWindow",
	"appName",
	"chromeExecutablePath",
	"storageStatePath",
	"brokerSocketPath",
	"headed",
	"browserWindowWidth",
	"browserWindowHeight",
	"browserWindowPositionX",
	"browserWindowPositionY",
	"idleShutdownMs",
	"conversationStateDir",
	"solAvailable",
	"proAvailable",
	"autoApproveToolCalls",
	"controlToken",
	"runtimeCommand",
	"acknowledgedUnofficialAt",
	"tunnel",
]);
const OWNED_TUNNEL_CONFIG_FIELDS = new Set([
	"binaryPath",
	"tunnelId",
	"runtimeKeyFile",
	"profileDir",
	"profileName",
	"alias",
]);
const BROWSER_IDLE_SHUTDOWN_MS = 60 * 1_000;
const BROWSER_WINDOW_WIDTH = 700;
const BROWSER_WINDOW_HEIGHT = 500;
const BROWSER_WINDOW_POSITION_X = 0;
const BROWSER_WINDOW_POSITION_Y = 0;

export function defaultChromeExecutable(platform: NodeJS.Platform = process.platform): string {
	if (platform === "darwin") return "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
	if (platform === "linux") return "/usr/bin/google-chrome";
	throw new Error(`The ChatGPT Web browser runtime does not support ${platform}.`);
}

interface OwnedTunnelConfig {
	binaryPath: string;
	tunnelId: string;
	runtimeKeyFile: string;
	profileDir: string;
	profileName: string;
	alias: string;
}

export interface OwnedDaemonConfig {
	releaseVersion: string;
	mode: "browser-only" | "full";
	host: "127.0.0.1";
	port: number;
	contextWindow: number;
	appName: string;
	chromeExecutablePath: string;
	storageStatePath: string;
	brokerSocketPath: string;
	headed: true;
	browserWindowWidth: number;
	browserWindowHeight: number;
	browserWindowPositionX: number;
	browserWindowPositionY: number;
	idleShutdownMs: number;
	conversationStateDir: string;
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

export function daemonConfigPath(account: OpenAiInternetAccount): string {
	return join(account.configDir, "config.json");
}

export function daemonLoginMarkerPath(account: OpenAiInternetAccount): string {
	return `${join(account.configDir, "browser", "storage-state.json")}.verified.json`;
}

export async function daemonLoginExists(account: OpenAiInternetAccount): Promise<boolean> {
	try {
		await stat(join(account.configDir, "browser", "storage-state.json"));
		const marker = JSON.parse(await readFile(daemonLoginMarkerPath(account), "utf8")) as Record<string, unknown>;
		return marker.version === 1 && marker.authenticated === true && typeof marker.verifiedAt === "string";
	} catch {
		return false;
	}
}

export async function readOwnedDaemonCapabilities(account: OpenAiInternetAccount): Promise<DaemonCapabilities> {
	try {
		const config: unknown = JSON.parse(await readFile(daemonConfigPath(account), "utf8"));
		validateOwnedConfig(config, account);
		return { solAvailable: config.solAvailable, proAvailable: config.proAvailable };
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return { solAvailable: true, proAvailable: false };
		throw error;
	}
}

export async function syncOwnedDaemonCapabilities(account: OpenAiInternetAccount): Promise<void> {
	const path = daemonConfigPath(account);
	const config: unknown = JSON.parse(await readFile(path, "utf8"));
	validateOwnedConfig(config, account);
	const marker = JSON.parse(await readFile(daemonLoginMarkerPath(account), "utf8")) as Record<string, unknown>;
	const solAvailable = marker.solAvailable === true;
	const proAvailable = solAvailable && marker.proAvailable === true;
	if (config.solAvailable === solAvailable && config.proAvailable === proAvailable) return;
	await writePrivateJson(path, { ...config, solAvailable, proAvailable });
}

export async function ensureOwnedDaemonConfig(
	account: OpenAiInternetAccount,
	options: OwnedDaemonConfigOptions = {},
): Promise<OwnedDaemonConfig> {
	const path = daemonConfigPath(account);
	const harness = await readHarnessConfig(account);
	let existing: OwnedDaemonConfig | undefined;
	try {
		const parsed: unknown = JSON.parse(await readFile(path, "utf8"));
		validateOwnedConfig(parsed, account);
		existing = parsed;
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
			existing.browserWindowPositionX === BROWSER_WINDOW_POSITION_X &&
			existing.browserWindowPositionY === BROWSER_WINDOW_POSITION_Y &&
			existing.idleShutdownMs === BROWSER_IDLE_SHUTDOWN_MS &&
			existing.conversationStateDir === join(account.configDir, "conversations")
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
		options.chromeExecutablePath ?? existing?.chromeExecutablePath ?? defaultChromeExecutable();
	const config: OwnedDaemonConfig = {
		releaseVersion,
		mode: harness.mode,
		host: "127.0.0.1",
		port: account.port,
		contextWindow: 256_000,
		appName: APP_NAME,
		chromeExecutablePath,
		storageStatePath: join(account.configDir, "browser", "storage-state.json"),
		brokerSocketPath: join(account.configDir, "runtime", "turn-broker.sock"),
		headed: true,
		browserWindowWidth: BROWSER_WINDOW_WIDTH,
		browserWindowHeight: BROWSER_WINDOW_HEIGHT,
		browserWindowPositionX: BROWSER_WINDOW_POSITION_X,
		browserWindowPositionY: BROWSER_WINDOW_POSITION_Y,
		idleShutdownMs: BROWSER_IDLE_SHUTDOWN_MS,
		conversationStateDir: join(account.configDir, "conversations"),
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

function validateOwnedConfig(value: unknown, account: OpenAiInternetAccount): asserts value is OwnedDaemonConfig {
	const path = daemonConfigPath(account);
	if (!isRecord(value)) throw new Error(`Invalid owned daemon configuration: ${path}`);
	assertSupportedFields(value, OWNED_DAEMON_CONFIG_FIELDS, path);
	const config = value as Partial<OwnedDaemonConfig>;
	if (typeof config.releaseVersion !== "string" || !config.releaseVersion.trim()) {
		throw new Error(`Invalid owned daemon release version: ${path}`);
	}
	if (config.mode !== "browser-only" && config.mode !== "full") {
		throw new Error(`Invalid owned daemon mode: ${path}`);
	}
	if (config.host !== "127.0.0.1" || config.port !== account.port) {
		throw new Error(`Owned daemon endpoint does not match account ${account.id}.`);
	}
	if (!/^[A-Za-z0-9_-]{40,}$/.test(config.controlToken ?? "")) {
		throw new Error(`Invalid owned daemon control token: ${path}`);
	}
	const requiredStrings = [
		config.appName,
		config.chromeExecutablePath,
		config.storageStatePath,
		config.brokerSocketPath,
		config.conversationStateDir,
		config.acknowledgedUnofficialAt,
	];
	if (requiredStrings.some((field) => typeof field !== "string" || field.length === 0)) {
		throw new Error(`Invalid owned daemon paths or metadata: ${path}`);
	}
	if (!Number.isSafeInteger(config.contextWindow) || (config.contextWindow ?? 0) <= 0) {
		throw new Error(`Invalid owned daemon context window: ${path}`);
	}
	if (
		!Number.isInteger(config.browserWindowWidth) ||
		(config.browserWindowWidth ?? 0) < 400 ||
		!Number.isInteger(config.browserWindowHeight) ||
		(config.browserWindowHeight ?? 0) < 300 ||
		!Number.isInteger(config.browserWindowPositionX) ||
		!Number.isInteger(config.browserWindowPositionY) ||
		!Number.isInteger(config.idleShutdownMs) ||
		(config.idleShutdownMs ?? -1) < 0
	) {
		throw new Error(`Invalid owned daemon browser settings: ${path}`);
	}
	if (config.headed !== true || config.autoApproveToolCalls !== false) {
		throw new Error(`Unsafe owned daemon browser or approval settings: ${path}`);
	}
	if (
		!Array.isArray(config.runtimeCommand) ||
		!config.runtimeCommand.length ||
		!config.runtimeCommand.every((part) => typeof part === "string" && part.length > 0)
	) {
		throw new Error(`Invalid owned daemon runtime command: ${path}`);
	}
	if (typeof config.solAvailable !== "boolean" || typeof config.proAvailable !== "boolean") {
		throw new Error(`Invalid owned daemon capabilities: ${path}`);
	}
	if (config.mode === "full") {
		if (!isRecord(config.tunnel)) throw new Error(`Full harness configuration is missing tunnel settings: ${path}`);
		assertSupportedFields(config.tunnel, OWNED_TUNNEL_CONFIG_FIELDS, `${path} tunnel`);
		if (
			[...OWNED_TUNNEL_CONFIG_FIELDS].some(
				(field) =>
					typeof config.tunnel?.[field as keyof OwnedTunnelConfig] !== "string" ||
					!config.tunnel[field as keyof OwnedTunnelConfig],
			)
		) {
			throw new Error(`Invalid full harness tunnel settings: ${path}`);
		}
	} else if (config.tunnel !== undefined) {
		throw new Error(`Browser-only configuration contains tunnel settings: ${path}`);
	}
}

function assertSupportedFields(value: Record<string, unknown>, fields: ReadonlySet<string>, label: string): void {
	const unsupported = Object.keys(value).filter((field) => !fields.has(field));
	if (unsupported.length > 0) {
		throw new Error(`${label} contains unsupported fields: ${unsupported.join(", ")}. Remove it and rerun setup.`);
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
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
