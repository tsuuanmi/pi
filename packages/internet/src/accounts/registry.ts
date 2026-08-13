import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { DEFAULT_DAEMON_HOST, DEFAULT_DAEMON_PORT } from "#internet/backends/openai/daemon/auth";
import type { InternetAccount, InternetAccountInput, InternetConversationMode } from "#internet/core/types";

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
		if (accounts.some((existing) => existing.host === account.host && existing.port === account.port)) {
			throw new Error(`Duplicate internet account endpoint: ${account.host}:${account.port}`);
		}
		accounts.push(account);
		await this.write(accounts);
		return account;
	}

	async setEnabled(id: string, enabled: boolean): Promise<InternetAccount> {
		return this.update(id, (account) => {
			account.enabled = enabled;
		});
	}

	async setConversationMode(id: string, conversationMode: InternetConversationMode): Promise<InternetAccount> {
		return this.update(id, (account) => {
			account.conversationMode = conversationMode;
		});
	}

	private async update(id: string, mutate: (account: InternetAccount) => void): Promise<InternetAccount> {
		const accounts = await this.list();
		const account = accounts.find((candidate) => candidate.id === id);
		if (!account) throw new Error(`Internet account not found: ${id}`);
		mutate(account);
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
		return normalizeAccounts(parsed.accounts);
	}

	private async readDefaultAccount(): Promise<InternetAccount> {
		return normalizeAccount({
			id: "default",
			displayName: "ChatGPT Web",
			configDir: join(dirname(this.path), "accounts", "default"),
			host: DEFAULT_DAEMON_HOST,
			port: DEFAULT_DAEMON_PORT,
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
	if (host !== DEFAULT_DAEMON_HOST) throw new Error(`Internet account host must be ${DEFAULT_DAEMON_HOST}.`);
	if (!Number.isInteger(port) || port < 1 || port > 65_535) throw new Error(`Invalid internet account port: ${port}`);
	return {
		id,
		backend: input.backend ?? "openai",
		displayName: input.displayName?.trim() || id,
		configDir,
		host,
		port,
		enabled: input.enabled ?? true,
		conversationMode: input.conversationMode ?? "temporary",
	};
}

function normalizeAccounts(accounts: InternetAccountInput[]): InternetAccount[] {
	const ids = new Set<string>();
	const endpoints = new Set<string>();
	return accounts.map((account) => {
		const normalized = normalizeAccount(account);
		if (ids.has(normalized.id)) throw new Error(`Duplicate internet account id: ${normalized.id}`);
		const endpoint = `${normalized.host}:${normalized.port}`;
		if (endpoints.has(endpoint)) throw new Error(`Duplicate internet account endpoint: ${endpoint}`);
		ids.add(normalized.id);
		endpoints.add(endpoint);
		return normalized;
	});
}
