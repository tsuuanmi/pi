import type {
	ApiKeyCredential,
	AuthAccountCollection,
	AuthCredential,
	AuthStorageData,
	AuthStorageEntry,
	BrowserCredential,
	OAuthCredential,
} from "#pi/auth/types";

type JsonObject = Record<string, unknown>;

export class AuthFormatError extends Error {
	constructor(path: string, message: string) {
		super(`${path}: ${message}`);
		this.name = "AuthFormatError";
	}
}

function fail(path: string, message: string): never {
	throw new AuthFormatError(path, message);
}

function object(value: unknown, path: string): JsonObject {
	if (typeof value !== "object" || value === null || Array.isArray(value)) fail(path, "must be an object");
	return value as JsonObject;
}

function exact(value: JsonObject, allowed: readonly string[], path: string): void {
	const keys = new Set(allowed);
	for (const key of Object.keys(value)) {
		if (!keys.has(key)) fail(`${path}.${key}`, "is not supported");
	}
}

function string(value: unknown, path: string): string {
	if (typeof value !== "string" || value.length === 0) fail(path, "must be a non-empty string");
	return value;
}

function recordName(value: string, path: string): string {
	string(value, path);
	if (value.trim() !== value || /[\x00/\\]/.test(value)) fail(path, "contains unsupported characters");
	if (value === "__proto__" || value === "constructor" || value === "prototype") fail(path, "is reserved");
	return value;
}

export function assertAuthName(value: string, path = "name"): void {
	recordName(value, path);
}

function credential(value: unknown, path: string): AuthCredential {
	const item = object(value, path);
	const type = string(item.type, `${path}.type`);
	if (type === "api_key") {
		exact(item, ["type", "key", "env"], path);
		const result: ApiKeyCredential = { type, key: string(item.key, `${path}.key`) };
		if ("env" in item) {
			const env: Record<string, string> = {};
			for (const [key, envValue] of Object.entries(object(item.env, `${path}.env`))) {
				if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
					fail(`${path}.env key`, "must be an environment variable name");
				}
				env[key] = string(envValue, `${path}.env.${key}`);
			}
			result.env = env;
		}
		return result;
	}
	if (type === "browser") {
		exact(item, ["type", "profileId", "tunnelSecret"], path);
		const profileId = string(item.profileId, `${path}.profileId`);
		if (!/^[a-zA-Z0-9_-]{16,128}$/.test(profileId)) fail(`${path}.profileId`, "has an invalid format");
		const tunnelSecret = string(item.tunnelSecret, `${path}.tunnelSecret`);
		if (tunnelSecret.length < 32) fail(`${path}.tunnelSecret`, "must contain at least 32 characters");
		return { type, profileId, tunnelSecret };
	}
	if (type === "oauth") {
		exact(item, ["type", "refresh", "access", "expires", "accountId"], path);
		if (typeof item.expires !== "number" || !Number.isFinite(item.expires) || item.expires < 0) {
			fail(`${path}.expires`, "must be a non-negative number");
		}
		const credential: OAuthCredential = {
			type,
			refresh: string(item.refresh, `${path}.refresh`),
			access: string(item.access, `${path}.access`),
			expires: item.expires,
		};
		if ("accountId" in item) {
			credential.accountId = string(item.accountId, `${path}.accountId`);
		}
		return credential;
	}
	return fail(`${path}.type`, `"${type}" is not supported`);
}

function collection(value: JsonObject, path: string): AuthAccountCollection {
	exact(value, ["active", "accounts"], path);
	const active = string(value.active, `${path}.active`);
	const accountsValue = object(value.accounts, `${path}.accounts`);
	const entries = Object.entries(accountsValue);
	if (entries.length === 0) fail(`${path}.accounts`, "must contain at least one account");
	const accounts: Record<string, AuthCredential> = {};
	for (const [name, account] of entries) {
		recordName(name, `${path}.accounts key`);
		accounts[name] = credential(account, `${path}.accounts.${name}`);
	}
	if (!Object.hasOwn(accounts, active)) fail(`${path}.active`, "must reference an existing account");
	return { active, accounts };
}

function entry(value: unknown, path: string): AuthStorageEntry {
	const item = object(value, path);
	return "type" in item ? credential(item, path) : collection(item, path);
}

export function isBrowserCredential(value: unknown): value is BrowserCredential {
	try {
		return credential(value, "credential").type === "browser";
	} catch {
		return false;
	}
}

export function isAuthCredential(value: AuthStorageEntry | undefined): value is AuthCredential {
	return typeof value === "object" && value !== null && "type" in value;
}

export function isAuthAccountCollection(value: AuthStorageEntry | undefined): value is AuthAccountCollection {
	return typeof value === "object" && value !== null && !("type" in value) && "active" in value && "accounts" in value;
}

function authData(value: unknown, source: string): AuthStorageData {
	const data = object(value, source);
	const result: AuthStorageData = {};
	for (const [provider, providerEntry] of Object.entries(data)) {
		recordName(provider, `${source} provider`);
		result[provider] = entry(providerEntry, `${source}.${provider}`);
	}
	return result;
}

export function parseAuth(content: string, source = "auth"): AuthStorageData {
	let value: unknown;
	try {
		value = JSON.parse(content) as unknown;
	} catch {
		throw new AuthFormatError(source, "is not valid JSON");
	}
	return authData(value, source);
}

export function serializeAuth(data: AuthStorageData): string {
	return `${JSON.stringify(authData(data, "auth"), null, 2)}\n`;
}
