import { createHash, randomBytes } from "node:crypto";
import { chmod, mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { type BrowserInternetAccount, isGeminiWebAccount } from "#internet/core/types";
import { readHarnessConfig } from "#internet/daemon/harness";

const APP_NAME = "Pi Internet";
const OWNED_DAEMON_CONFIG_FIELDS = new Set([
	"adapter",
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
	"proAvailable",
	"autoApproveToolCalls",
	"controlToken",
	"runtimeCommand",
	"acknowledgedUnofficialAt",
	"tunnel",
	"capabilitiesPath",
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
	throw new Error(`The browser-backed internet runtime does not support ${platform}.`);
}

interface OwnedTunnelConfig {
	binaryPath: string;
	tunnelId: string;
	runtimeKeyFile: string;
	profileDir: string;
	profileName: string;
	alias: string;
}

interface OwnedDaemonConfigBase {
	releaseVersion: string;
	host: "127.0.0.1";
	port: number;
	contextWindow: number;
	appName: typeof APP_NAME;
	chromeExecutablePath: string;
	storageStatePath: string;
	headed: true;
	browserWindowWidth: number;
	browserWindowHeight: number;
	browserWindowPositionX: number;
	browserWindowPositionY: number;
	idleShutdownMs: number;
	conversationStateDir: string;
	controlToken: string;
	runtimeCommand: string[];
	acknowledgedUnofficialAt: string;
}

export interface ChatGptWebDaemonConfig extends OwnedDaemonConfigBase {
	adapter: "chatgpt-web";
	mode: "browser-only" | "full";
	brokerSocketPath: string;
	proAvailable: boolean;
	autoApproveToolCalls: false;
	tunnel?: OwnedTunnelConfig;
}

export interface GeminiWebDaemonConfig extends OwnedDaemonConfigBase {
	adapter: "gemini-web";
	mode: "browser-only";
	capabilitiesPath: string;
}

export type OwnedDaemonConfig = ChatGptWebDaemonConfig | GeminiWebDaemonConfig;

type UnvalidatedOwnedDaemonConfig = Partial<OwnedDaemonConfigBase> & {
	adapter?: OwnedDaemonConfig["adapter"];
	mode?: ChatGptWebDaemonConfig["mode"];
	brokerSocketPath?: string;
	proAvailable?: boolean;
	autoApproveToolCalls?: false;
	capabilitiesPath?: string;
	tunnel?: OwnedTunnelConfig;
};

export interface OwnedDaemonConfigOptions {
	chromeExecutablePath?: string;
	releaseVersion?: string;
	runtimeCommand?: string[];
}

export interface DaemonCapabilities {
	proAvailable: boolean;
	models?: Array<{ id: string; label: string; description: string }>;
}

export function daemonConfigFingerprint(config: OwnedDaemonConfig): string {
	return createHash("sha256").update(JSON.stringify(config)).digest("hex");
}

export function daemonConfigPath(account: BrowserInternetAccount): string {
	return join(account.configDir, "config.json");
}

export function daemonLoginMarkerPath(account: BrowserInternetAccount): string {
	return isGeminiWebAccount(account)
		? join(account.configDir, "capabilities.json")
		: `${join(account.configDir, "browser", "storage-state.json")}.verified.json`;
}

export async function daemonLoginExists(account: BrowserInternetAccount): Promise<boolean> {
	try {
		await stat(join(account.configDir, "browser", "storage-state.json"));
		const marker = JSON.parse(await readFile(daemonLoginMarkerPath(account), "utf8")) as Record<string, unknown>;
		return isGeminiWebAccount(account)
			? marker.version === 1 &&
					marker.provider === "gemini-web" &&
					typeof marker.authenticatedAt === "string" &&
					marker.signOutHref === "https://accounts.google.com/SignOutOptions" &&
					isRecord(marker.capabilities)
			: marker.version === 2 &&
					marker.authenticated === true &&
					typeof marker.verifiedAt === "string" &&
					typeof marker.proAvailable === "boolean";
	} catch {
		return false;
	}
}

export async function readOwnedDaemonCapabilities(account: BrowserInternetAccount): Promise<DaemonCapabilities> {
	try {
		const config: unknown = JSON.parse(await readFile(daemonConfigPath(account), "utf8"));
		validateOwnedConfig(config, account);
		if (isGeminiWebAccount(account)) {
			const marker = JSON.parse(await readFile(daemonLoginMarkerPath(account), "utf8")) as Record<string, unknown>;
			const capabilities = marker.capabilities;
			if (!isRecord(capabilities) || !Array.isArray(capabilities.available) || !isRecord(capabilities.labels)) {
				throw new Error(`Invalid Gemini Web capabilities: ${daemonLoginMarkerPath(account)}`);
			}
			const labels = capabilities.labels as Record<string, unknown>;
			const models = capabilities.available.map((id) => {
				if (id !== "flash" && id !== "thinking" && id !== "pro")
					throw new Error(`Invalid Gemini Web model: ${String(id)}`);
				const label = labels[id];
				if (typeof label !== "string" || !label.trim()) throw new Error(`Invalid Gemini Web model label: ${id}`);
				return { id, label, description: `Gemini Web ${label}` };
			});
			return { proAvailable: false, models };
		}
		if (config.adapter !== "chatgpt-web")
			throw new Error(`Invalid ChatGPT Web daemon configuration: ${daemonConfigPath(account)}`);
		return { proAvailable: config.proAvailable };
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return { proAvailable: false };
		throw error;
	}
}

export async function syncOwnedDaemonCapabilities(account: BrowserInternetAccount): Promise<void> {
	const path = daemonConfigPath(account);
	const config: unknown = JSON.parse(await readFile(path, "utf8"));
	validateOwnedConfig(config, account);
	if (config.adapter === "gemini-web") return;
	const marker = JSON.parse(await readFile(daemonLoginMarkerPath(account), "utf8")) as Record<string, unknown>;
	const proAvailable = marker.proAvailable === true;
	if (config.proAvailable === proAvailable) return;
	await writePrivateJson(path, { ...config, proAvailable });
}

export async function ensureOwnedDaemonConfig(
	account: BrowserInternetAccount,
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
				? existing.mode === "browser-only" && (existing.adapter === "gemini-web" || existing.tunnel === undefined)
				: existing.adapter === "chatgpt-web" &&
					existing.mode === "full" &&
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
	if (!runtimeCommand?.length) throw new Error("The bundled browser runtime command is required.");
	const releaseVersion = options.releaseVersion ?? existing?.releaseVersion;
	if (!releaseVersion) throw new Error("The bundled browser runtime version is required.");
	const chromeExecutablePath =
		options.chromeExecutablePath ?? existing?.chromeExecutablePath ?? defaultChromeExecutable();
	if (isGeminiWebAccount(account)) {
		if (harness.mode !== "browser-only")
			throw new Error("Gemini Web accounts cannot enable tunnel or Full harness mode.");
		const config: OwnedDaemonConfig = {
			adapter: "gemini-web",
			releaseVersion,
			mode: "browser-only",
			host: "127.0.0.1",
			port: account.port,
			contextWindow: 32_000,
			appName: APP_NAME,
			chromeExecutablePath,
			storageStatePath: join(account.configDir, "browser", "storage-state.json"),
			headed: true,
			browserWindowWidth: BROWSER_WINDOW_WIDTH,
			browserWindowHeight: BROWSER_WINDOW_HEIGHT,
			browserWindowPositionX: BROWSER_WINDOW_POSITION_X,
			browserWindowPositionY: BROWSER_WINDOW_POSITION_Y,
			idleShutdownMs: BROWSER_IDLE_SHUTDOWN_MS,
			conversationStateDir: join(account.configDir, "conversations"),
			capabilitiesPath: join(account.configDir, "capabilities.json"),
			controlToken: existing?.controlToken ?? randomBytes(32).toString("base64url"),
			runtimeCommand,
			acknowledgedUnofficialAt: new Date().toISOString(),
		};
		await writePrivateJson(path, config);
		return config;
	}
	const config: OwnedDaemonConfig = {
		adapter: "chatgpt-web",
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
		proAvailable: existing?.adapter === "chatgpt-web" ? existing.proAvailable : false,
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

function validateOwnedConfig(value: unknown, account: BrowserInternetAccount): asserts value is OwnedDaemonConfig {
	const path = daemonConfigPath(account);
	if (!isRecord(value)) throw new Error(`Invalid owned daemon configuration: ${path}`);
	assertSupportedFields(value, OWNED_DAEMON_CONFIG_FIELDS, path);
	const config = value as UnvalidatedOwnedDaemonConfig;
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
	const expectedAdapter = isGeminiWebAccount(account) ? "gemini-web" : "chatgpt-web";
	if (config.adapter !== expectedAdapter)
		throw new Error(`Owned daemon adapter does not match account ${account.id}.`);
	if (isGeminiWebAccount(account)) {
		if (
			config.mode !== "browser-only" ||
			config.appName !== APP_NAME ||
			config.brokerSocketPath !== undefined ||
			config.tunnel !== undefined
		) {
			throw new Error(`Gemini Web daemon configuration contains ChatGPT-only fields: ${path}`);
		}
		if (typeof config.capabilitiesPath !== "string" || !config.capabilitiesPath) {
			throw new Error(`Gemini Web daemon capabilities path is missing: ${path}`);
		}
	} else if (config.appName !== APP_NAME) {
		throw new Error(`Invalid owned daemon connector identity: ${path}`);
	}
	const requiredStrings = [
		config.chromeExecutablePath,
		config.storageStatePath,
		...(isGeminiWebAccount(account) ? [] : [config.brokerSocketPath]),
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
	if (config.headed !== true || (!isGeminiWebAccount(account) && config.autoApproveToolCalls !== false)) {
		throw new Error(`Unsafe owned daemon browser or approval settings: ${path}`);
	}
	if (
		!Array.isArray(config.runtimeCommand) ||
		!config.runtimeCommand.length ||
		!config.runtimeCommand.every((part) => typeof part === "string" && part.length > 0)
	) {
		throw new Error(`Invalid owned daemon runtime command: ${path}`);
	}
	if (
		!isGeminiWebAccount(account) &&
		(typeof config.proAvailable !== "boolean" || config.autoApproveToolCalls !== false)
	) {
		throw new Error(`Invalid owned daemon capabilities: ${path}`);
	}
	if (isGeminiWebAccount(account)) return;
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
