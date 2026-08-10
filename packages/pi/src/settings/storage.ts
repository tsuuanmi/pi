import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { resolvePath } from "@tsuuanmi/pi-agent/node";
import lockfile from "proper-lockfile";
import { CONFIG_DIR_NAME } from "#pi/loader/app";
import { getAgentDir } from "#pi/loader/paths";
import type { SettingsScope, SettingsStorage } from "#pi/settings/types";
import { assertPrivateFile, ensurePrivateDir, writePrivateFile } from "#pi/storage/file";

function lock(path: string): () => void {
	const attempts = 10;
	for (let attempt = 1; attempt <= attempts; attempt++) {
		try {
			return lockfile.lockSync(path, { realpath: false });
		} catch (error) {
			const code =
				typeof error === "object" && error !== null && "code" in error
					? String((error as { code?: unknown }).code)
					: undefined;
			if (code !== "ELOCKED" || attempt === attempts) throw error;
			const started = Date.now();
			while (Date.now() - started < 20) {
				// Settings storage is synchronous; retry only while another writer owns the lock.
			}
		}
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

	read(scope: SettingsScope): string | undefined {
		const path = this.paths[scope];
		if (!existsSync(path)) return undefined;
		assertPrivateFile(path);
		const release = lock(path);
		try {
			return readFileSync(path, "utf8");
		} finally {
			release();
		}
	}

	update(scope: SettingsScope, update: (current: string | undefined) => string): void {
		const path = this.paths[scope];
		ensurePrivateDir(dirname(path));
		const release = lock(path);
		try {
			if (existsSync(path)) assertPrivateFile(path);
			const current = existsSync(path) ? readFileSync(path, "utf8") : undefined;
			writePrivateFile(path, update(current));
		} finally {
			release();
		}
	}
}

export class MemoryStorage implements SettingsStorage {
	private readonly values: Record<SettingsScope, string | undefined> = {
		global: undefined,
		project: undefined,
	};

	read(scope: SettingsScope): string | undefined {
		return this.values[scope];
	}

	update(scope: SettingsScope, update: (current: string | undefined) => string): void {
		this.values[scope] = update(this.values[scope]);
	}
}
