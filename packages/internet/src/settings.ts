import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import type { InternetSettings } from "#internet/core/types";

const DEFAULT_SETTINGS: InternetSettings = { autoLogin: true };

interface SettingsFile extends InternetSettings {
	version: 1;
}

export interface InternetSettingsService {
	get(): Promise<InternetSettings>;
	setAutoLogin(autoLogin: boolean): Promise<InternetSettings>;
}

export interface InternetSettingsStoreOptions {
	path?: string;
}

export function getInternetSettingsPath(env: NodeJS.ProcessEnv = process.env): string {
	const agentDir = env.PI_AGENT_DIR?.trim() || join(homedir(), ".pi", "agent");
	return join(resolve(agentDir), "internet", "settings.json");
}

export class InternetSettingsStore implements InternetSettingsService {
	readonly path: string;

	constructor(options: InternetSettingsStoreOptions = {}) {
		this.path = options.path ?? getInternetSettingsPath();
	}

	async get(): Promise<InternetSettings> {
		let raw: string;
		try {
			raw = await readFile(this.path, "utf8");
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === "ENOENT") return { ...DEFAULT_SETTINGS };
			throw error;
		}
		const parsed = JSON.parse(raw) as Partial<SettingsFile>;
		if (parsed.version !== 1 || typeof parsed.autoLogin !== "boolean") {
			throw new Error(`Invalid internet settings: ${this.path}`);
		}
		return { autoLogin: parsed.autoLogin };
	}

	async setAutoLogin(autoLogin: boolean): Promise<InternetSettings> {
		const settings = { autoLogin };
		const directory = dirname(this.path);
		await mkdir(directory, { recursive: true, mode: 0o700 });
		const temporary = join(directory, `.${basename(this.path)}.${process.pid}.${Date.now()}.tmp`);
		const payload: SettingsFile = { version: 1, ...settings };
		await writeFile(temporary, `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o600 });
		await chmod(temporary, 0o600);
		await rename(temporary, this.path);
		await chmod(this.path, 0o600);
		return settings;
	}
}
