import { randomUUID } from "node:crypto";
import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { InternetError } from "#internet/core/errors";
import {
	type InternetAccount,
	type InternetAccountInput,
	type InternetBackendId,
	type InternetConversationMode,
	isOpenAiAccount,
	type OpenAiInternetAccount,
} from "#internet/core/types";

const registryVersion = 2;
const defaultPort = 17841;
const accountIdPattern = /^[a-z0-9][a-z0-9-]{0,31}$/;
const environmentNamePattern = /^[A-Za-z_][A-Za-z0-9_]*$/;

interface AccountRegistryFile {
	schemaVersion: typeof registryVersion;
	accounts: InternetAccount[];
}

export function getAccountRegistryPath(env: NodeJS.ProcessEnv = process.env): string {
	const agentDir = env.PI_AGENT_DIR?.trim() || join(homedir(), ".pi", "agent");
	return join(resolve(agentDir), "internet", "accounts.json");
}

function defaultConfigDir(registryPath: string, id: string): string {
	return join(dirname(registryPath), "accounts", id);
}

function defaultAccount(registryPath: string): OpenAiInternetAccount {
	return {
		id: "default",
		backend: "openai",
		displayName: "ChatGPT Web",
		configDir: defaultConfigDir(registryPath, "default"),
		host: "127.0.0.1",
		port: defaultPort,
		enabled: true,
		conversationMode: "durable",
	};
}

function configError(message: string): InternetError {
	return new InternetError(message, { code: "config_invalid" });
}

function record(value: unknown, name: string): Record<string, unknown> {
	if (!value || typeof value !== "object" || Array.isArray(value)) throw configError(`${name} must be an object.`);
	return value as Record<string, unknown>;
}

function assertKnownKeys(value: Record<string, unknown>, allowed: readonly string[], name: string): void {
	const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
	if (unknown.length > 0) throw configError(`${name} contains unsupported fields: ${unknown.join(", ")}.`);
}

function requiredString(value: unknown, name: string): string {
	if (typeof value !== "string" || value.trim() === "") throw configError(`${name} must be a non-empty string.`);
	return value.trim();
}

function optionalBoolean(value: unknown, fallback: boolean, name: string): boolean {
	if (value === undefined) return fallback;
	if (typeof value !== "boolean") throw configError(`${name} must be a boolean.`);
	return value;
}

function normalizeCommon(value: Record<string, unknown>): Pick<InternetAccount, "id" | "displayName" | "enabled"> {
	const id = requiredString(value.id, "Account id");
	if (!accountIdPattern.test(id)) throw configError(`Invalid account id: ${id}`);
	return {
		id,
		displayName: value.displayName === undefined ? id : requiredString(value.displayName, "Account displayName"),
		enabled: optionalBoolean(value.enabled, true, "Account enabled"),
	};
}

function normalizeConversationMode(value: unknown): InternetConversationMode {
	if (value === undefined) return "durable";
	if (value !== "temporary" && value !== "durable") {
		throw configError("Account conversationMode must be temporary or durable.");
	}
	return value;
}

function normalizeAccount(value: unknown, registryPath: string): InternetAccount {
	const input = record(value, "Account");
	const backend = requiredString(input.backend, "Account backend");
	const common = normalizeCommon(input);
	if (backend === "openai") {
		assertKnownKeys(
			input,
			["id", "backend", "displayName", "enabled", "configDir", "host", "port", "conversationMode"],
			`Account ${common.id}`,
		);
		const host = input.host === undefined ? "127.0.0.1" : requiredString(input.host, "Account host");
		if (host !== "127.0.0.1") throw configError("Internet daemon accounts must bind to 127.0.0.1.");
		const port = input.port === undefined ? defaultPort : input.port;
		if (!Number.isInteger(port) || Number(port) < 1 || Number(port) > 65_535) {
			throw configError("Account port must be an integer from 1 to 65535.");
		}
		return {
			...common,
			backend,
			configDir:
				input.configDir === undefined
					? defaultConfigDir(registryPath, common.id)
					: resolve(requiredString(input.configDir, "Account configDir")),
			host,
			port: Number(port),
			conversationMode: normalizeConversationMode(input.conversationMode),
		};
	}
	if (backend === "anthropic" || backend === "google") {
		assertKnownKeys(input, ["id", "backend", "displayName", "enabled", "apiKeyEnv"], `Account ${common.id}`);
		const apiKeyEnv = requiredString(input.apiKeyEnv, "Account apiKeyEnv");
		if (!environmentNamePattern.test(apiKeyEnv)) throw configError(`Invalid API-key environment name: ${apiKeyEnv}`);
		return { ...common, backend, apiKeyEnv };
	}
	throw configError(`Unsupported internet backend: ${backend}`);
}

function nextDaemonPort(accounts: InternetAccount[]): number {
	const ports = new Set(accounts.filter(isOpenAiAccount).map((account) => account.port));
	for (let port = defaultPort; port <= 65_535; port += 1) {
		if (!ports.has(port)) return port;
	}
	throw configError("No loopback daemon port is available.");
}

function validateAccounts(accounts: InternetAccount[]): void {
	const ids = new Set<string>();
	const endpoints = new Set<string>();
	for (const account of accounts) {
		if (ids.has(account.id)) throw configError(`Duplicate account id: ${account.id}`);
		ids.add(account.id);
		if (!isOpenAiAccount(account)) continue;
		const endpoint = `${account.host}:${account.port}`;
		if (endpoints.has(endpoint)) throw configError(`Duplicate daemon endpoint: ${endpoint}`);
		endpoints.add(endpoint);
	}
}

function parseRegistry(raw: string, registryPath: string): AccountRegistryFile {
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch (cause) {
		throw new InternetError("Account registry is not valid JSON.", { code: "config_invalid", cause });
	}
	const file = record(parsed, "Account registry");
	assertKnownKeys(file, ["schemaVersion", "accounts"], "Account registry");
	if (file.schemaVersion !== registryVersion) {
		throw configError(`Unsupported account registry schema version: ${String(file.schemaVersion)}`);
	}
	if (!Array.isArray(file.accounts)) throw configError("Account registry accounts must be an array.");
	const accounts = file.accounts.map((account) => normalizeAccount(account, registryPath));
	validateAccounts(accounts);
	return { schemaVersion: registryVersion, accounts };
}

export class AccountRegistry {
	readonly path: string;

	constructor(path = getAccountRegistryPath()) {
		this.path = resolve(path);
	}

	async list(): Promise<InternetAccount[]> {
		try {
			return parseRegistry(await readFile(this.path, "utf8"), this.path).accounts;
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === "ENOENT") return [defaultAccount(this.path)];
			throw error;
		}
	}

	async listBackend<TBackend extends InternetBackendId>(
		backend: TBackend,
	): Promise<Extract<InternetAccount, { backend: TBackend }>[]> {
		return (await this.list()).filter(
			(account): account is Extract<InternetAccount, { backend: TBackend }> => account.backend === backend,
		);
	}

	async getOpenAi(id?: string): Promise<OpenAiInternetAccount> {
		const accounts = await this.listBackend("openai");
		const account = id
			? accounts.find((candidate) => candidate.id === id)
			: accounts.find((candidate) => candidate.enabled);
		if (!account) {
			throw configError(id ? `Unknown ChatGPT Web account: ${id}` : "No enabled ChatGPT Web account exists.");
		}
		return account;
	}

	async add(input: InternetAccountInput): Promise<InternetAccount> {
		const accounts = await this.list();
		const normalizedInput =
			input.backend === "openai" && input.port === undefined ? { ...input, port: nextDaemonPort(accounts) } : input;
		const account = normalizeAccount(normalizedInput, this.path);
		if (accounts.some((candidate) => candidate.id === account.id))
			throw configError(`Account already exists: ${account.id}`);
		validateAccounts([...accounts, account]);
		await this.write([...accounts, account]);
		return account;
	}

	async remove(id: string): Promise<void> {
		const accounts = await this.list();
		if (!accounts.some((account) => account.id === id)) throw configError(`Unknown internet account: ${id}`);
		await this.write(accounts.filter((account) => account.id !== id));
	}

	async setEnabled(id: string, enabled: boolean): Promise<InternetAccount> {
		const accounts = await this.list();
		const index = accounts.findIndex((account) => account.id === id);
		if (index < 0) throw configError(`Unknown internet account: ${id}`);
		const current = accounts[index];
		if (!current) throw configError(`Unknown internet account: ${id}`);
		const updated = { ...current, enabled };
		accounts[index] = updated;
		await this.write(accounts);
		return updated;
	}

	async setConversationMode(id: string, conversationMode: InternetConversationMode): Promise<OpenAiInternetAccount> {
		const accounts = await this.list();
		const index = accounts.findIndex((account) => account.id === id);
		const current = accounts[index];
		if (!current) throw configError(`Unknown internet account: ${id}`);
		if (!isOpenAiAccount(current)) throw configError(`Account ${id} does not support browser conversations.`);
		const updated = { ...current, conversationMode };
		accounts[index] = updated;
		await this.write(accounts);
		return updated;
	}

	private async write(accounts: InternetAccount[]): Promise<void> {
		validateAccounts(accounts);
		const directory = dirname(this.path);
		const temporary = `${this.path}.${process.pid}.${randomUUID()}.tmp`;
		await mkdir(directory, { recursive: true, mode: 0o700 });
		await chmod(directory, 0o700);
		await writeFile(temporary, `${JSON.stringify({ schemaVersion: registryVersion, accounts }, null, 2)}\n`, {
			mode: 0o600,
		});
		await chmod(temporary, 0o600);
		await rename(temporary, this.path);
		await chmod(this.path, 0o600);
	}
}
