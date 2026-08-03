import { homedir } from "node:os";
import { join } from "node:path";
import { normalizePath } from "@tsuuanmi/pi-agent/node";
import { APP_NAME, CONFIG_DIR_NAME, ENV_AGENT_DIR } from "#pi/loader/app";

export function expandTildePath(path: string): string {
	return normalizePath(path);
}

export function getAgentDir(): string {
	const envDir = process.env[ENV_AGENT_DIR];
	if (envDir) {
		return expandTildePath(envDir);
	}
	return join(homedir(), CONFIG_DIR_NAME, "agent");
}

export function getAuthPath(): string {
	return join(getAgentDir(), "auth.json");
}

export function getBinDir(): string {
	return join(getAgentDir(), "bin");
}

export function getSessionsDir(): string {
	return join(getAgentDir(), "sessions");
}

export function getDebugLogPath(): string {
	return join(getAgentDir(), `${APP_NAME}-debug.log`);
}
