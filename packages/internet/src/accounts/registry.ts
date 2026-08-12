import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import {
	DEFAULT_DAEMON_HOST,
	DEFAULT_DAEMON_PORT,
	getDaemonConfigDir,
	readDaemonConfig,
} from "#internet/backends/openai/daemon/auth";
import { InternetError } from "#internet/core/errors";
import type { InternetAccount, InternetAccountInput } from "#internet/core/types";

const ACCOUNT_ID_PATTERN = /^[a-z0-9](?:[a-z0-9._-]{0,62}[a-z0-9])?$/;

interface RegistryFile {
	version: 1;
	accounts: InternetAccount[];
}

export interface AccountRegistryOptions {
	path?: string;
}

export function getAccountRegistryPath(env: NodeJS.ProcessEnv = process.env): string {
	const agentDir = env.PI_AGENT_DIR?.trim() || join(homedir(), ".pi", "agent");
	return join(resolve(agentDir), "internet", "accounts.json");
}

export class AccountRegistry {
	readonly path: string;

	constructor(options: AccountRegistryOptions = {}) {
		this.path = options.path ?? getAccountRegistryPath();
	}

	async list(): Promise<InternetAccount[]> {
		const stored = await this.readStored();
		if (stored) return stored;
		return [await this.readDefaultAccount()];
	}

	async get(id?: string): Promise<InternetAccount> {
		const accounts = await this.list();
		const account = id
			? accounts.find((candidate) => candidate.id === id)
			: accounts.find((candidate) => candidate.enabled);
		if (!account)
			throw new Error(id ? `Internet account not found: ${id}` : "No enabled internet account is configured.");
		return account;
	}

	async add(input: InternetAccountInput): Promise<InternetAccount> {
		const account = normalizeAccount(input);
		const accounts = await this.list();
		if (accounts.some((existing) => existing.id === account.id)) {
			throw new Error(`Internet account already exists: ${account.id}`);
		}
		accounts.push(account);
		await this.write(accounts);
		return account;
	}

	async setEnabled(id: string, enabled: boolean): Promise<InternetAccount> {
		const accounts = await this.list();
		const account = accounts.find((candidate) => candidate.id === id);
		if (!account) throw new Error(`Internet account not found: ${id}`);
		account.enabled = enabled;
		await this.write(accounts);
		return account;
	}

	private async readStored(): Promise<InternetAccount[] | undefined> {
		let raw: string;
		try {
			raw = await readFile(this.path, "utf8");
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
			throw error;
		}
		const parsed = JSON.parse(raw) as RegistryFile;
		if (parsed.version !== 1 || !Array.isArray(parsed.accounts)) {
			throw new Error(`Invalid internet account registry: ${this.path}`);
		}
		return parsed.accounts.map(normalizeAccount);
	}

	private async readDefaultAccount(): Promise<InternetAccount> {
		const configDir = getDaemonConfigDir();
		let host = DEFAULT_DAEMON_HOST;
		let port = DEFAULT_DAEMON_PORT;
		try {
			const config = await readDaemonConfig(configDir);
			host = config.host;
			port = config.port;
		} catch (error) {
			if (!(error instanceof InternetError) || error.code !== "config_missing") throw error;
		}
		return normalizeAccount({
			id: "default",
			displayName: "ChatGPT Web",
			configDir,
			host,
			port,
			enabled: true,
		});
	}

	private async write(accounts: InternetAccount[]): Promise<void> {
		const directory = dirname(this.path);
		await mkdir(directory, { recursive: true, mode: 0o700 });
		const temporary = join(directory, `.${basename(this.path)}.${process.pid}.${Date.now()}.tmp`);
		const payload: RegistryFile = { version: 1, accounts };
		await writeFile(temporary, `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o600 });
		await chmod(temporary, 0o600);
		await rename(temporary, this.path);
		await chmod(this.path, 0o600);
	}
}

function normalizeAccount(input: InternetAccountInput): InternetAccount {
	const id = input.id.trim().toLowerCase();
	if (!ACCOUNT_ID_PATTERN.test(id)) throw new Error(`Invalid internet account id: ${input.id}`);
	const configDir = resolve(input.configDir);
	const host = input.host?.trim() || DEFAULT_DAEMON_HOST;
	const port = input.port ?? DEFAULT_DAEMON_PORT;
	if (host !== "127.0.0.1" && host !== "localhost" && host !== "::1") {
		throw new Error(`Internet account host must be loopback: ${host}`);
	}
	if (!Number.isInteger(port) || port < 1 || port > 65_535) throw new Error(`Invalid internet account port: ${port}`);
	return {
		id,
		backend: input.backend ?? "openai",
		displayName: input.displayName?.trim() || id,
		configDir,
		host,
		port,
		enabled: input.enabled ?? true,
	};
}
