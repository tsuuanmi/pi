import { resolvePath } from "@tsuuanmi/pi-agent/node";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import lockfile from "proper-lockfile";
import { CONFIG_DIR_NAME } from "#pi/loader/app";
import { getAgentDir } from "#pi/loader/paths";
import type { SettingsScope, SettingsStorage } from "#pi/settings/types";

function lockWithRetry(path: string): () => void {
	const attempts = 10;
	const delayMs = 20;
	let lastError: unknown;

	for (let attempt = 1; attempt <= attempts; attempt++) {
		try {
			return lockfile.lockSync(path, { realpath: false });
		} catch (error) {
			const code =
				typeof error === "object" && error !== null && "code" in error
					? String((error as { code?: unknown }).code)
					: undefined;
			if (code !== "ELOCKED" || attempt === attempts) {
				throw error;
			}
			lastError = error;
			const started = Date.now();
			while (Date.now() - started < delayMs) {
				// Keep the synchronous storage contract while waiting for the lock.
			}
		}
	}

	if (lastError !== undefined) {
		throw lastError;
	}
	throw new Error(`Failed to acquire settings lock: ${path}`);
}

export class FileStorage implements SettingsStorage {
	private readonly paths: Record<SettingsScope, string>;

	constructor(cwd: string, agentDir: string = getAgentDir()) {
		const resolvedCwd = resolvePath(cwd);
		const resolvedAgentDir = resolvePath(agentDir);
		this.paths = {
			global: join(resolvedAgentDir, "settings.json"),
			project: join(resolvedCwd, CONFIG_DIR_NAME, "settings.json"),
		};
	}

	withLock(scope: SettingsScope, fn: (current: string | undefined) => string | undefined): void {
		const path = this.paths[scope];
		const dir = dirname(path);
		const fileExists = existsSync(path);
		let release: (() => void) | undefined;

		try {
			if (fileExists) {
				release = lockWithRetry(path);
			}

			const current = fileExists ? readFileSync(path, "utf-8") : undefined;
			const next = fn(current);
			if (next === undefined) {
				return;
			}

			if (!existsSync(dir)) {
				mkdirSync(dir, { recursive: true });
			}
			if (!release) {
				release = lockWithRetry(path);
			}
			writeFileSync(path, next, "utf-8");
		} finally {
			release?.();
		}
	}
}

export class MemoryStorage implements SettingsStorage {
	private readonly values: Record<SettingsScope, string | undefined> = {
		global: undefined,
		project: undefined,
	};

	withLock(scope: SettingsScope, fn: (current: string | undefined) => string | undefined): void {
		const next = fn(this.values[scope]);
		if (next !== undefined) {
			this.values[scope] = next;
		}
	}
}
