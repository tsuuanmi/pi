import { readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { InternetError } from "#internet/core/errors";

export const DEFAULT_DAEMON_HOST = "127.0.0.1";
export const DEFAULT_DAEMON_PORT = 17841;

export interface DaemonConfig {
	host: string;
	port: number;
	controlToken: string;
	configDir: string;
}

interface ConfigFile {
	host?: unknown;
	port?: unknown;
	controlToken?: unknown;
}

export function getDaemonConfigDir(env: NodeJS.ProcessEnv = process.env): string {
	const configured = env.CODEX_CHATGPT_WEB_HOME?.trim();
	return configured ? resolve(configured) : join(homedir(), ".codex-chatgpt-web");
}

export function daemonBaseUrl(config: Pick<DaemonConfig, "host" | "port">, includeVersion = false): string {
	const baseUrl = `http://${config.host}:${config.port}`;
	return includeVersion ? `${baseUrl}/v1` : baseUrl;
}

export function controlHeaders(controlToken: string): Record<string, string> {
	return { authorization: `Bearer ${controlToken}` };
}

export async function readDaemonConfig(configDir = getDaemonConfigDir()): Promise<DaemonConfig> {
	const path = join(configDir, "config.json");
	let raw: string;
	try {
		const metadata = await stat(path);
		if ((metadata.mode & 0o077) !== 0) {
			throw new InternetError(`Daemon config must not be group/world accessible: ${path}`, {
				code: "config_invalid",
			});
		}
		raw = await readFile(path, "utf8");
	} catch (error) {
		if (error instanceof InternetError) throw error;
		const code = (error as NodeJS.ErrnoException).code;
		throw new InternetError(
			code === "ENOENT" ? `Daemon config not found: ${path}` : `Unable to read daemon config: ${path}`,
			{ code: code === "ENOENT" ? "config_missing" : "config_invalid", cause: error },
		);
	}

	let parsed: ConfigFile;
	try {
		parsed = JSON.parse(raw) as ConfigFile;
	} catch (error) {
		throw new InternetError(`Daemon config is not valid JSON: ${path}`, {
			code: "config_invalid",
			cause: error,
		});
	}

	const host = typeof parsed.host === "string" ? parsed.host.trim() : "";
	const port = parsed.port;
	const controlToken = typeof parsed.controlToken === "string" ? parsed.controlToken.trim() : "";
	if (
		!host ||
		!Number.isInteger(port) ||
		(port as number) < 1 ||
		(port as number) > 65_535 ||
		!/^[A-Za-z0-9_-]{40,}$/.test(controlToken)
	) {
		throw new InternetError(`Daemon config has invalid host, port, or controlToken: ${path}`, {
			code: "config_invalid",
		});
	}
	if (host !== "127.0.0.1" && host !== "localhost" && host !== "::1") {
		throw new InternetError(`Daemon host must be loopback, received: ${host}`, { code: "config_invalid" });
	}

	return { host, port: port as number, controlToken, configDir };
}
