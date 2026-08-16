import { createHash, randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, join, resolve, win32 } from "node:path";
import {
  assertDurableRuntimeCommand,
  atomicWriteFile,
  currentRuntimeCommand,
  expandUserPath,
  getConfigDir,
  getConfigPath,
  VERSION,
} from "#runtime/core/config";
import { conversationRuntimeDigest } from "#runtime/providers/chatgpt-web/conversation/journal";
import type { ProviderConfig } from "#runtime/providers/chatgpt-web/protocol/types";

export {
  atomicWriteFile,
  currentRuntimeCommand,
  expandUserPath,
  getConfigDir,
  getConfigPath,
};

/** Default connector identity used by the ChatGPT Web adapter. */
export const DEFAULT_CONNECTOR_NAME = "Pi Internet";

export type RuntimeMode = "browser-only" | "full";

export function resolveSetupConnectorName(existingName?: string, requestedName?: string): string {
  if (requestedName !== undefined) {
    const requested = requestedName.trim();
    if (!requested || requested.length > 80) throw new Error("Connector name is invalid");
    return requested;
  }
  const existing = existingName?.trim();
  return existing || DEFAULT_CONNECTOR_NAME;
}

export interface TunnelConfig {
  binaryPath: string;
  tunnelId: string;
  runtimeKeyFile: string;
  profileDir: string;
  profileName: string;
  alias: string;
}

export interface AppConfig {
  releaseVersion: string;
  mode: RuntimeMode;
  host: "127.0.0.1";
  port: number;
  contextWindow: number;
  appName: string;
  chromeExecutablePath: string;
  storageStatePath: string;
  brokerSocketPath: string;
  headed: boolean;
  browserWindowWidth: number;
  browserWindowHeight: number;
  browserWindowPositionX: number;
  browserWindowPositionY: number;
  idleShutdownMs: number;
  conversationStateDir: string;
  proAvailable: boolean;
  autoApproveToolCalls: boolean;
  controlToken: string;
  runtimeCommand: string[];
  acknowledgedUnofficialAt?: string;
  tunnel?: TunnelConfig;
}

const APP_CONFIG_FIELDS = new Set([
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
]);
const TUNNEL_CONFIG_FIELDS = new Set([
  "binaryPath",
  "tunnelId",
  "runtimeKeyFile",
  "profileDir",
  "profileName",
  "alias",
]);

export function isWindowsPipeEndpoint(value: string): boolean {
  return /^\\\\\.\\pipe\\[A-Za-z0-9._-]+$/.test(value);
}
export function defaultBrokerEndpoint(home = getConfigDir(), platform = process.platform): string {
  if (platform !== "win32") return join(home, "runtime", "turn-broker.sock");
  const identity = createHash("sha256").update(resolve(home).toLowerCase()).digest("hex").slice(0, 20);
  return `\\\\.\\pipe\\pi-internet-runtime-${identity}`;
}

export function resolveBrokerEndpoint(value: string): string {
  const expanded = expandUserPath(value);
  return isWindowsPipeEndpoint(expanded) ? expanded : resolve(expanded);
}

export function defaultConfig(mode: RuntimeMode = "browser-only"): AppConfig {
  const home = getConfigDir();
  return {
    releaseVersion: VERSION,
    mode,
    host: "127.0.0.1",
    port: 17841,
    contextWindow: 256_000,
    appName: DEFAULT_CONNECTOR_NAME,
    chromeExecutablePath: defaultChromeExecutable(),
    storageStatePath: join(home, "browser", "storage-state.json"),
    brokerSocketPath: defaultBrokerEndpoint(home),
    headed: true,
    browserWindowWidth: 700,
    browserWindowHeight: 500,
    browserWindowPositionX: 0,
    browserWindowPositionY: 0,
    idleShutdownMs: 60 * 1_000,
    conversationStateDir: join(home, "conversations"),
    proAvailable: false,
    autoApproveToolCalls: false,
    controlToken: randomBytes(32).toString("base64url"),
    runtimeCommand: currentRuntimeCommand(),
  };
}

export function defaultChromeExecutable(
  platform = process.platform,
  programFiles = process.env.PROGRAMFILES,
): string {
  if (platform === "darwin") {
    return "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  }
  if (platform === "win32") {
    return win32.join(programFiles || "C:\\Program Files", "Google", "Chrome", "Application", "chrome.exe");
  }
  return "/usr/bin/google-chrome";
}

export function loadConfig(): AppConfig {
  const path = getConfigPath();
  if (!existsSync(path)) throw new Error(`Configuration is missing: ${path}. Run pi-internet-runtime setup first.`);
  return parseConfig(JSON.parse(readFileSync(path, "utf8")), path);
}

export function loadConfigForSetup(): AppConfig {
  return loadConfig();
}

function parseConfig(value: unknown, path: string): AppConfig {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`Invalid configuration object in ${path}`);
  const parsed = value as Partial<AppConfig> & Record<string, unknown>;
  assertSupportedFields(parsed, APP_CONFIG_FIELDS, path);
  if (typeof parsed.releaseVersion !== "string" || !parsed.releaseVersion.trim()) throw new Error(`Missing releaseVersion in ${path}`);
  if (parsed.mode !== "browser-only" && parsed.mode !== "full") throw new Error(`Invalid runtime mode in ${path}`);
  if (parsed.host !== "127.0.0.1") throw new Error("The Responses proxy must bind to 127.0.0.1");
  if (!Number.isInteger(parsed.port) || parsed.port! < 1 || parsed.port! > 65_535) throw new Error(`Invalid port in ${path}`);
  if (!Number.isSafeInteger(parsed.contextWindow) || parsed.contextWindow! <= 0) {
    throw new Error(`Invalid contextWindow in ${path}`);
  }
  if (typeof parsed.headed !== "boolean") throw new Error(`Invalid headed in ${path}`);
  if (typeof parsed.browserWindowWidth !== "number"
    || !Number.isInteger(parsed.browserWindowWidth)
    || parsed.browserWindowWidth < 400
    || parsed.browserWindowWidth > 3_840) {
    throw new Error(`Invalid browserWindowWidth in ${path}`);
  }
  if (typeof parsed.browserWindowHeight !== "number"
    || !Number.isInteger(parsed.browserWindowHeight)
    || parsed.browserWindowHeight < 300
    || parsed.browserWindowHeight > 2_160) {
    throw new Error(`Invalid browserWindowHeight in ${path}`);
  }
  if (!Number.isInteger(parsed.browserWindowPositionX) || !Number.isInteger(parsed.browserWindowPositionY)) {
    throw new Error(`Invalid browserWindowPosition in ${path}`);
  }
  if (typeof parsed.idleShutdownMs !== "number"
    || !Number.isInteger(parsed.idleShutdownMs)
    || parsed.idleShutdownMs < 0
    || parsed.idleShutdownMs > 24 * 60 * 60 * 1_000) {
    throw new Error(`Invalid idleShutdownMs in ${path}`);
  }
  if (typeof parsed.conversationStateDir !== "string" || !isAbsolute(expandUserPath(parsed.conversationStateDir))) {
    throw new Error(`conversationStateDir must be absolute in ${path}`);
  }
  if (typeof parsed.autoApproveToolCalls !== "boolean") {
    throw new Error(`Invalid autoApproveToolCalls in ${path}`);
  }
  const requiredStrings: Array<keyof AppConfig> = [
    "appName", "chromeExecutablePath", "storageStatePath", "brokerSocketPath", "controlToken",
  ];
  for (const key of requiredStrings) {
    if (typeof parsed[key] !== "string" || !(parsed[key] as string).trim()) throw new Error(`Missing ${key} in ${path}`);
  }
  if (parsed.appName!.length > 80) throw new Error(`appName is too long in ${path}`);
  for (const key of ["chromeExecutablePath", "storageStatePath"] as const) {
    if (!isAbsolute(expandUserPath(parsed[key]!))) throw new Error(`${key} must be absolute in ${path}`);
  }
  const brokerEndpoint = expandUserPath(parsed.brokerSocketPath!);
  if (process.platform === "win32") {
    if (!isWindowsPipeEndpoint(brokerEndpoint)) {
      throw new Error(`Windows brokerSocketPath must be a named pipe in ${path}`);
    }
  } else if (!isAbsolute(brokerEndpoint) || isWindowsPipeEndpoint(brokerEndpoint)) {
    throw new Error(`brokerSocketPath must be an absolute Unix socket path in ${path}`);
  }
  if (!/^[A-Za-z0-9_-]{40,}$/.test(parsed.controlToken!)) throw new Error(`Invalid controlToken in ${path}`);
  if (parsed.mode === "full") {
    if (!parsed.tunnel || typeof parsed.tunnel !== "object") throw new Error("Full mode requires tunnel configuration");
    assertSupportedFields(parsed.tunnel as unknown as Record<string, unknown>, TUNNEL_CONFIG_FIELDS, `${path} tunnel`);
    for (const key of ["binaryPath", "tunnelId", "runtimeKeyFile", "profileDir", "profileName", "alias"] as const) {
      if (typeof parsed.tunnel[key] !== "string" || !parsed.tunnel[key].trim()) {
        throw new Error(`Missing tunnel.${key} in ${path}`);
      }
    }
    if (!/^tunnel_[a-f0-9]{32}$/.test(parsed.tunnel.tunnelId)) {
      throw new Error(`Invalid tunnel.tunnelId in ${path}`);
    }
    for (const key of ["profileName", "alias"] as const) {
      if (!/^[A-Za-z0-9._-]+$/.test(parsed.tunnel[key])) {
        throw new Error(`Invalid tunnel.${key} in ${path}`);
      }
    }
    for (const key of ["binaryPath", "runtimeKeyFile", "profileDir"] as const) {
      if (!isAbsolute(expandUserPath(parsed.tunnel[key]))) {
        throw new Error(`tunnel.${key} must be absolute in ${path}`);
      }
    }
  } else if (parsed.tunnel !== undefined) {
    throw new Error(`Browser-only configuration contains tunnel settings in ${path}`);
  }
  if (!Array.isArray(parsed.runtimeCommand) || parsed.runtimeCommand.length === 0
    || parsed.runtimeCommand.some(part => typeof part !== "string" || !part.trim())) {
    throw new Error(`Invalid runtimeCommand in ${path}`);
  }
  assertDurableRuntimeCommand(parsed.runtimeCommand as string[]);
  if (parsed.acknowledgedUnofficialAt !== undefined && typeof parsed.acknowledgedUnofficialAt !== "string") {
    throw new Error(`Invalid acknowledgedUnofficialAt in ${path}`);
  }
  if (typeof parsed.proAvailable !== "boolean") {
    throw new Error(`Invalid proAvailable in ${path}`);
  }
  return { ...parsed, proAvailable: parsed.proAvailable } as AppConfig;
}

function assertSupportedFields(value: Record<string, unknown>, fields: ReadonlySet<string>, label: string): void {
  const unsupported = Object.keys(value).filter(field => !fields.has(field));
  if (unsupported.length > 0) {
    throw new Error(`${label} contains unsupported fields: ${unsupported.join(", ")}. Remove it and rerun setup.`);
  }
}

export function saveConfig(config: AppConfig): void {
  atomicWriteFile(getConfigPath(), `${JSON.stringify(config, null, 2)}\n`);
}

export function providerConfig(config: AppConfig): ProviderConfig {
  const model = "gpt-5.6-sol";
  const models = [model];
  const efforts = ["low", "medium", "high", "xhigh", ...(config.proAvailable ? ["max"] : [])];
  return {
    adapter: "chatgpt-web",
    mode: config.mode,
    baseUrl: "https://chatgpt.com",
    models,
    liveModels: false,
    defaultModel: model,
    contextWindow: config.contextWindow,
    modelInputModalities: Object.fromEntries(models.map(model => [model, ["text", "image"]])),
    modelReasoningEfforts: { [model]: efforts },
    modelDefaultReasoningEfforts: { [model]: "high" },
    noReasoningModels: [],
    chatgptWeb: {
      appName: config.appName,
      storageStatePath: config.storageStatePath,
      chromeExecutablePath: config.chromeExecutablePath,
      brokerSocketPath: config.brokerSocketPath,
      threadEnvironmentStatePath: join(getConfigDir(), "runtime", "thread-environments.json"),
      conversationStateDir: config.conversationStateDir,
      conversationRuntimeDigest: conversationRuntimeDigest({
        releaseVersion: config.releaseVersion,
        runtimeCommand: config.runtimeCommand,
        window: [
          config.browserWindowWidth,
          config.browserWindowHeight,
          config.browserWindowPositionX,
          config.browserWindowPositionY,
        ],
        idleShutdownMs: config.idleShutdownMs,
        policyVersion: 1,
      }),
      headed: config.headed,
      browserWindowWidth: config.browserWindowWidth,
      browserWindowHeight: config.browserWindowHeight,
      browserWindowPositionX: config.browserWindowPositionX,
      browserWindowPositionY: config.browserWindowPositionY,
      localToolsEnabled: config.mode === "full",
      proAvailable: config.proAvailable,
      autoApproveToolCalls: config.autoApproveToolCalls,
    },
  };
}
