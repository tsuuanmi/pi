import { closeSync, chmodSync, existsSync, mkdirSync, openSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { basename, delimiter, dirname, isAbsolute, join, resolve, sep } from "node:path";

export const VERSION = "0.1.0";

interface BunRuntimeGlobal {
  main?: string;
  which(command: string): string | null;
}

function bunRuntime(): BunRuntimeGlobal | undefined {
  return (globalThis as typeof globalThis & { Bun?: BunRuntimeGlobal }).Bun;
}

export interface RuntimeServiceConfig {
  host: "127.0.0.1";
  port: number;
  controlToken: string;
  runtimeCommand: string[];
}

export type RuntimeMode = "browser-only" | "full";

export interface RuntimeConfigBase extends RuntimeServiceConfig {
  releaseVersion: string;
  contextWindow: number;
  idleShutdownMs: number;
}

export interface RuntimeTunnelConfig {
  binaryPath: string;
  tunnelId: string;
  runtimeKeyFile: string;
  profileDir: string;
  profileName: string;
  alias: string;
}

export interface ChatGptWebRuntimeConfig extends RuntimeConfigBase {
  adapter: "chatgpt-web";
  mode: RuntimeMode;
  appName: string;
  chromeExecutablePath: string;
  storageStatePath: string;
  brokerSocketPath: string;
  headed: boolean;
  browserWindowWidth: number;
  browserWindowHeight: number;
  browserWindowPositionX: number;
  browserWindowPositionY: number;
  conversationStateDir: string;
  proAvailable: boolean;
  autoApproveToolCalls: boolean;
  acknowledgedUnofficialAt?: string;
  tunnel?: RuntimeTunnelConfig;
}

export interface GeminiWebRuntimeConfig extends RuntimeConfigBase {
  adapter: "gemini-web";
  mode: "browser-only";
  appName: string;
  chromeExecutablePath: string;
  storageStatePath: string;
  headed: boolean;
  browserWindowWidth: number;
  browserWindowHeight: number;
  browserWindowPositionX: number;
  browserWindowPositionY: number;
  conversationStateDir: string;
  capabilitiesPath: string;
  acknowledgedUnofficialAt: string;
}

export type RuntimeConfig = ChatGptWebRuntimeConfig | GeminiWebRuntimeConfig;

const GEMINI_CONFIG_FIELDS = new Set([
  "adapter", "releaseVersion", "mode", "host", "port", "contextWindow", "appName", "chromeExecutablePath",
  "storageStatePath", "headed", "browserWindowWidth", "browserWindowHeight", "browserWindowPositionX",
  "browserWindowPositionY", "idleShutdownMs", "conversationStateDir", "capabilitiesPath", "controlToken",
  "runtimeCommand", "acknowledgedUnofficialAt",
]);

export function parseGeminiWebRuntimeConfig(value: unknown, path = "Gemini Web config"): GeminiWebRuntimeConfig {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${path} must be an object`);
  const parsed = value as Record<string, unknown>;
  const unsupported = Object.keys(parsed).filter(field => !GEMINI_CONFIG_FIELDS.has(field));
  if (unsupported.length > 0) throw new Error(`${path} contains unsupported fields: ${unsupported.join(", ")}`);
  if (parsed.adapter !== "gemini-web") throw new Error(`${path} adapter must be gemini-web`);
  if (parsed.mode !== "browser-only" || parsed.host !== "127.0.0.1") {
    throw new Error("Gemini Web requires browser-only loopback mode");
  }
  const strings = [
    "releaseVersion", "appName", "chromeExecutablePath", "storageStatePath", "conversationStateDir",
    "capabilitiesPath", "controlToken", "acknowledgedUnofficialAt",
  ] as const;
  if (strings.some(field => typeof parsed[field] !== "string" || !(parsed[field] as string).trim())) {
    throw new Error(`${path} is missing required strings`);
  }
  if (["chromeExecutablePath", "storageStatePath", "conversationStateDir", "capabilitiesPath"].some(
    field => !isAbsolute(parsed[field] as string),
  )) throw new Error(`${path} paths must be absolute`);
  if (!Number.isSafeInteger(parsed.port) || (parsed.port as number) < 1 || (parsed.port as number) > 65_535) {
    throw new Error(`${path} port is invalid`);
  }
  if (!Number.isSafeInteger(parsed.contextWindow) || (parsed.contextWindow as number) <= 0) {
    throw new Error(`${path} context window is invalid`);
  }
  if (!Number.isInteger(parsed.idleShutdownMs) || (parsed.idleShutdownMs as number) < 0) {
    throw new Error(`${path} idle timeout is invalid`);
  }
  if (parsed.headed !== true || ["browserWindowWidth", "browserWindowHeight"].some(
    field => !Number.isInteger(parsed[field]) || (parsed[field] as number) < 300,
  ) || ["browserWindowPositionX", "browserWindowPositionY"].some(field => !Number.isInteger(parsed[field]))) {
    throw new Error(`${path} browser settings are invalid`);
  }
  if (!Array.isArray(parsed.runtimeCommand) || parsed.runtimeCommand.length === 0
    || !parsed.runtimeCommand.every(part => typeof part === "string" && part.length > 0)) {
    throw new Error(`${path} runtime command is invalid`);
  }
  if (!/^[A-Za-z0-9_-]{40,}$/.test(parsed.controlToken as string)) {
    throw new Error(`${path} control token is invalid`);
  }
  return parsed as unknown as GeminiWebRuntimeConfig;
}

export function loadRuntimeConfig(): RuntimeConfig {
  const path = getConfigPath();
  if (!existsSync(path)) throw new Error(`Runtime configuration does not exist: ${path}`);
  let value: unknown;
  try {
    value = JSON.parse(readFileSync(path, "utf8")) as unknown;
  } catch (error) {
    throw new Error(`Runtime configuration is not valid JSON: ${path}`, { cause: error });
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`Runtime configuration must be an object: ${path}`);
  const adapter = (value as Record<string, unknown>).adapter;
  if (adapter === "gemini-web") return parseGeminiWebRuntimeConfig(value, path);
  if (adapter === "chatgpt-web") return value as ChatGptWebRuntimeConfig;
  throw new Error(`Runtime configuration adapter is unsupported: ${String(adapter)}`);
}

export function expandUserPath(value: string): string {
  if (value === "~") return homedir();
  if (value.startsWith("~/") || value.startsWith("~\\")) return join(homedir(), value.slice(2));
  return value;
}

export function getConfigDir(): string {
  const configured = process.env.PI_INTERNET_RUNTIME_HOME?.trim();
  return resolve(expandUserPath(configured || join(homedir(), ".pi-internet-runtime")));
}

export function getConfigPath(): string {
  return join(getConfigDir(), "config.json");
}

const atomicWaitCell = new Int32Array(new SharedArrayBuffer(4));
const WINDOWS_RENAME_RETRY_DELAYS_MS = [25, 50, 100, 150, 250, 350, 500] as const;

function renameAtomicFile(source: string, destination: string): void {
  for (let attempt = 0; ; attempt += 1) {
    try {
      renameSync(source, destination);
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      const transientWindowsError = process.platform === "win32"
        && (code === "EBUSY" || code === "EPERM" || code === "EACCES");
      const delay = WINDOWS_RENAME_RETRY_DELAYS_MS[attempt];
      if (!transientWindowsError || delay === undefined) throw error;
      Atomics.wait(atomicWaitCell, 0, 0, delay);
    }
  }
}

export function atomicWriteFile(path: string, data: string | Uint8Array): void {
  const directory = dirname(path);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  try { chmodSync(directory, 0o700); } catch { /* Windows ACLs are managed by the installer. */ }
  const temp = `${path}.tmp-${process.pid}-${crypto.randomUUID()}`;
  const fd = openSync(temp, "wx", 0o600);
  try {
    writeFileSync(fd, data);
    closeSync(fd);
    renameAtomicFile(temp, path);
  } catch (error) {
    try { closeSync(fd); } catch {}
    rmSync(temp, { force: true });
    throw error;
  }
  try { chmodSync(path, 0o600); } catch { /* Windows ACLs are managed by the installer. */ }
}

export function currentRuntimeCommand(): string[] {
  const executableName = basename(process.execPath).toLowerCase();
  const bunExecutable = executableName === "bun" || executableName === "bun.exe"
    ? installedBunExecutable()
    : undefined;
  return runtimeCommandForProcess({
    launcher: process.env.PI_INTERNET_RUNTIME_LAUNCHER,
    executable: process.execPath,
    entry: bunRuntime()?.main ?? process.argv[1],
    bunExecutable,
  });
}

export function installedBunExecutable({
  platform = process.platform,
  pathValue = process.env.PATH || process.env.Path || "",
  candidates = [],
}: {
  platform?: NodeJS.Platform;
  pathValue?: string;
  candidates?: Array<string | null | undefined>;
} = {}): string {
  const executableName = platform === "win32" ? "bun.exe" : "bun";
  const pathDelimiter = platform === "win32" ? ";" : delimiter;
  const pathCandidates = pathValue
    .split(pathDelimiter)
    .map(part => part.trim().replace(/^"(.*)"$/, "$1"))
    .filter(Boolean)
    .map(part => join(part, executableName));
  const discovered = [
    process.env.PI_INTERNET_RUNTIME_BUN,
    ...candidates,
    ...pathCandidates,
    bunRuntime()?.which("bun"),
    process.execPath,
  ];
  for (const candidate of discovered) {
    if (!candidate?.trim()) continue;
    const executable = resolve(candidate.trim());
    try {
      assertDurableRuntimeCommand([executable]);
      return executable;
    } catch {
      // Candidate discovery is exhaustive; the final error remains explicit.
    }
  }
  throw new Error("A durable installed Bun executable was not found outside temporary directories");
}

export function runtimeCommandForProcess({
  launcher,
  executable,
  entry,
  bunExecutable,
}: {
  launcher?: string;
  executable: string;
  entry?: string;
  bunExecutable?: string | null;
}): string[] {
  launcher = launcher?.trim();
  if (launcher) {
    const command = [resolve(launcher)];
    assertDurableRuntimeCommand(command);
    return command;
  }
  executable = resolve(executable);
  const executableName = basename(executable).toLowerCase();
  if (executableName === "bun" || executableName === "bun.exe") {
    if (!entry || entry.endsWith("/[eval]") || entry === "[eval]") {
      throw new Error("Cannot install a service from an evaluated Bun script");
    }
    const command = [resolve(bunExecutable?.trim() || executable), resolve(entry)];
    assertDurableRuntimeCommand(command);
    return command;
  }
  const command = [executable];
  assertDurableRuntimeCommand(command);
  return command;
}

function inside(path: string, root: string): boolean {
  const normalize = (value: string) => process.platform === "win32" ? resolve(value).toLowerCase() : resolve(value);
  const normalizedPath = normalize(path);
  const normalizedRoot = normalize(root);
  return normalizedPath === normalizedRoot || normalizedPath.startsWith(`${normalizedRoot}${sep}`);
}

export function assertDurableRuntimeCommand(command: string[]): void {
  if (command.length === 0) throw new Error("Runtime command is empty");
  const executable = command[0]!;
  if (!isAbsolute(executable)) throw new Error(`Runtime executable must be absolute: ${executable}`);
  const ephemeralRoots = [tmpdir(), "/tmp", "/private/tmp", "/var/tmp", "/private/var/tmp"];
  for (const part of command) {
    if (!isAbsolute(part)) continue;
    if (ephemeralRoots.some(root => inside(part, root))) {
      throw new Error(`Runtime command must not reference an ephemeral path: ${part}`);
    }
  }
  if (!existsSync(executable)) throw new Error(`Runtime executable does not exist: ${executable}`);
}
