/**
 * Credential storage for API keys and OAuth tokens.
 * Handles loading, saving, and refreshing credentials from auth.json.
 *
 * Uses file locking to prevent race conditions when multiple pi instances
 * try to refresh tokens simultaneously.
 */

import {
	findEnvKeys,
	getEnvApiKey,
	type OAuthCredentials,
	type OAuthLoginCallbacks,
	type OAuthProviderId,
} from "@tsuuanmi/pi-ai";
import { getOAuthApiKey, getOAuthProvider, getOAuthProviders } from "@tsuuanmi/pi-ai/oauth";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import lockfile from "proper-lockfile";
import { normalizePath } from "../utils/fs/paths.ts";
import { getAgentDir } from "./config.ts";
import { resolveConfigValue } from "./resolve-config-value.ts";

export type ApiKeyCredential = {
	type: "api_key";
	key: string;
	env?: Record<string, string>;
};

export type OAuthCredential = {
	type: "oauth";
} & OAuthCredentials;

export type AuthCredential = ApiKeyCredential | OAuthCredential;

export type AuthAccountCollection = {
	active?: string;
	accounts: Record<string, AuthCredential>;
};

export type AuthStorageEntry = AuthCredential | AuthAccountCollection;

export type AuthStorageData = Record<string, AuthStorageEntry>;

export type AuthStatus = {
	configured: boolean;
	source?: "stored" | "runtime" | "environment" | "fallback" | "models_json_key" | "models_json_command";
	label?: string;
};

type LockResult<T> = {
	result: T;
	next?: string;
};

const AUTH_FILE_WRITE_OPTIONS = { encoding: "utf-8", mode: 0o600 } as const;

function isAuthCredential(value: AuthStorageEntry | undefined): value is AuthCredential {
	return (
		typeof value === "object" &&
		value !== null &&
		"type" in value &&
		(value.type === "api_key" || value.type === "oauth")
	);
}

function isAuthAccountCollection(value: AuthStorageEntry | undefined): value is AuthAccountCollection {
	return (
		typeof value === "object" &&
		value !== null &&
		!("type" in value) &&
		"accounts" in value &&
		typeof value.accounts === "object" &&
		value.accounts !== null
	);
}

export interface AuthStorageBackend {
	withLock<T>(fn: (current: string | undefined) => LockResult<T>): T;
	withLockAsync<T>(fn: (current: string | undefined) => Promise<LockResult<T>>): Promise<T>;
}

export class FileAuthStorageBackend implements AuthStorageBackend {
	private authPath: string;

	constructor(authPath: string = join(getAgentDir(), "auth.json")) {
		this.authPath = normalizePath(authPath);
	}

	private ensureParentDir(): void {
		const dir = dirname(this.authPath);
		if (!existsSync(dir)) {
			mkdirSync(dir, { recursive: true, mode: 0o700 });
		}
	}

	private ensureFileExists(): void {
		if (!existsSync(this.authPath)) {
			writeFileSync(this.authPath, "{}", AUTH_FILE_WRITE_OPTIONS);
			chmodSync(this.authPath, 0o600);
		}
	}

	private acquireLockSyncWithRetry(path: string): () => void {
		const maxAttempts = 10;
		const delayMs = 20;
		let lastError: unknown;

		for (let attempt = 1; attempt <= maxAttempts; attempt++) {
			try {
				return lockfile.lockSync(path, { realpath: false });
			} catch (error) {
				const code =
					typeof error === "object" && error !== null && "code" in error
						? String((error as { code?: unknown }).code)
						: undefined;
				if (code !== "ELOCKED" || attempt === maxAttempts) {
					throw error;
				}
				lastError = error;
				const start = Date.now();
				while (Date.now() - start < delayMs) {
					// Sleep synchronously to avoid changing callers to async.
				}
			}
		}

		throw (lastError as Error) ?? new Error("Failed to acquire auth storage lock");
	}

	withLock<T>(fn: (current: string | undefined) => LockResult<T>): T {
		this.ensureParentDir();
		this.ensureFileExists();

		let release: (() => void) | undefined;
		try {
			release = this.acquireLockSyncWithRetry(this.authPath);
			const current = existsSync(this.authPath) ? readFileSync(this.authPath, "utf-8") : undefined;
			const { result, next } = fn(current);
			if (next !== undefined) {
				writeFileSync(this.authPath, next, AUTH_FILE_WRITE_OPTIONS);
				chmodSync(this.authPath, 0o600);
			}
			return result;
		} finally {
			if (release) {
				release();
			}
		}
	}

	async withLockAsync<T>(fn: (current: string | undefined) => Promise<LockResult<T>>): Promise<T> {
		this.ensureParentDir();
		this.ensureFileExists();

		let release: (() => Promise<void>) | undefined;
		let lockCompromised = false;
		let lockCompromisedError: Error | undefined;
		const throwIfCompromised = () => {
			if (lockCompromised) {
				throw lockCompromisedError ?? new Error("Auth storage lock was compromised");
			}
		};

		try {
			release = await lockfile.lock(this.authPath, {
				retries: {
					retries: 10,
					factor: 2,
					minTimeout: 100,
					maxTimeout: 10000,
					randomize: true,
				},
				stale: 30000,
				onCompromised: (err) => {
					lockCompromised = true;
					lockCompromisedError = err;
				},
			});

			throwIfCompromised();
			const current = existsSync(this.authPath) ? readFileSync(this.authPath, "utf-8") : undefined;
			const { result, next } = await fn(current);
			throwIfCompromised();
			if (next !== undefined) {
				writeFileSync(this.authPath, next, AUTH_FILE_WRITE_OPTIONS);
				chmodSync(this.authPath, 0o600);
			}
			throwIfCompromised();
			return result;
		} finally {
			if (release) {
				try {
					await release();
				} catch {
					// Ignore unlock errors when lock is compromised.
				}
			}
		}
	}
}

export class InMemoryAuthStorageBackend implements AuthStorageBackend {
	private value: string | undefined;

	withLock<T>(fn: (current: string | undefined) => LockResult<T>): T {
		const { result, next } = fn(this.value);
		if (next !== undefined) {
			this.value = next;
		}
		return result;
	}

	async withLockAsync<T>(fn: (current: string | undefined) => Promise<LockResult<T>>): Promise<T> {
		const { result, next } = await fn(this.value);
		if (next !== undefined) {
			this.value = next;
		}
		return result;
	}
}

/**
 * Credential storage backed by a JSON file.
 */
export class AuthStorage {
	private data: AuthStorageData = {};
	private runtimeOverrides: Map<string, string> = new Map();
	private fallbackResolver?: (provider: string) => string | undefined;
	private loadError: Error | null = null;
	private errors: Error[] = [];
	private storage: AuthStorageBackend;

	private constructor(storage: AuthStorageBackend) {
		this.storage = storage;
		this.reload();
	}

	static create(authPath?: string): AuthStorage {
		return new AuthStorage(new FileAuthStorageBackend(authPath ?? join(getAgentDir(), "auth.json")));
	}

	static fromStorage(storage: AuthStorageBackend): AuthStorage {
		return new AuthStorage(storage);
	}

	static inMemory(data: AuthStorageData = {}): AuthStorage {
		const storage = new InMemoryAuthStorageBackend();
		storage.withLock(() => ({ result: undefined, next: JSON.stringify(data, null, 2) }));
		return AuthStorage.fromStorage(storage);
	}

	/**
	 * Set a runtime API key override (not persisted to disk).
	 */
	setRuntimeApiKey(provider: string, apiKey: string): void {
		this.runtimeOverrides.set(provider, apiKey);
	}

	/**
	 * Remove a runtime API key override.
	 */
	removeRuntimeApiKey(provider: string): void {
		this.runtimeOverrides.delete(provider);
	}

	/**
	 * Set a fallback resolver for API keys not found in auth.json or env vars.
	 * Used for custom provider keys from models.json.
	 */
	setFallbackResolver(resolver: (provider: string) => string | undefined): void {
		this.fallbackResolver = resolver;
	}

	private recordError(error: unknown): void {
		const normalizedError = error instanceof Error ? error : new Error(String(error));
		this.errors.push(normalizedError);
	}

	private parseStorageData(content: string | undefined): AuthStorageData {
		if (!content) {
			return {};
		}
		return JSON.parse(content) as AuthStorageData;
	}

	private getActiveAccountName(entry: AuthStorageEntry | undefined): string | undefined {
		if (!isAuthAccountCollection(entry)) return undefined;
		if (entry.active && entry.accounts[entry.active]) return entry.active;
		return Object.keys(entry.accounts)[0];
	}

	private getActiveCredential(entry: AuthStorageEntry | undefined): AuthCredential | undefined {
		if (isAuthCredential(entry)) return entry;
		const activeAccount = this.getActiveAccountName(entry);
		return activeAccount ? entry?.accounts[activeAccount] : undefined;
	}

	private setCredentialInEntry(
		entry: AuthStorageEntry | undefined,
		credential: AuthCredential,
		accountName?: string,
	): AuthStorageEntry {
		if (!accountName) {
			if (isAuthAccountCollection(entry)) {
				const activeAccount = this.getActiveAccountName(entry) ?? "default";
				return {
					active: activeAccount,
					accounts: { ...entry.accounts, [activeAccount]: credential },
				};
			}
			return credential;
		}

		const accounts: Record<string, AuthCredential> = isAuthAccountCollection(entry)
			? { ...entry.accounts }
			: isAuthCredential(entry)
				? { default: entry }
				: {};
		accounts[accountName] = credential;
		return { active: accountName, accounts };
	}

	private replaceActiveCredential(entry: AuthStorageEntry | undefined, credential: AuthCredential): AuthStorageEntry {
		if (!isAuthAccountCollection(entry)) return credential;
		const activeAccount = this.getActiveAccountName(entry) ?? "default";
		return {
			active: activeAccount,
			accounts: { ...entry.accounts, [activeAccount]: credential },
		};
	}

	/**
	 * Reload credentials from storage.
	 */
	reload(): void {
		let content: string | undefined;
		try {
			this.storage.withLock((current) => {
				content = current;
				return { result: undefined };
			});
			this.data = this.parseStorageData(content);
			this.loadError = null;
		} catch (error) {
			this.loadError = error as Error;
			this.recordError(error);
		}
	}

	private persistProviderChange(provider: string, entry: AuthStorageEntry | undefined): void {
		if (this.loadError) {
			return;
		}

		try {
			this.storage.withLock((current) => {
				const currentData = this.parseStorageData(current);
				const merged: AuthStorageData = { ...currentData };
				if (entry) {
					merged[provider] = entry;
				} else {
					delete merged[provider];
				}
				return { result: undefined, next: JSON.stringify(merged, null, 2) };
			});
		} catch (error) {
			this.recordError(error);
		}
	}

	/**
	 * Get credential for a provider.
	 */
	get(provider: string): AuthCredential | undefined {
		return this.getActiveCredential(this.data[provider]);
	}

	/**
	 * Get names for stored accounts for a provider.
	 */
	getAccountNames(provider: string): string[] {
		const entry = this.data[provider];
		if (isAuthAccountCollection(entry)) return Object.keys(entry.accounts);
		if (isAuthCredential(entry)) return ["default"];
		return [];
	}

	/**
	 * Get the active stored account name for a provider.
	 */
	getActiveAccount(provider: string): string | undefined {
		const entry = this.data[provider];
		if (isAuthAccountCollection(entry)) return this.getActiveAccountName(entry);
		if (isAuthCredential(entry)) return "default";
		return undefined;
	}

	/**
	 * Switch the active account for a provider.
	 */
	switchAccount(provider: string, accountName: string): boolean {
		const entry = this.data[provider];
		if (isAuthAccountCollection(entry)) {
			if (!entry.accounts[accountName]) return false;
			const nextEntry: AuthAccountCollection = { ...entry, active: accountName };
			this.data[provider] = nextEntry;
			this.persistProviderChange(provider, nextEntry);
			return true;
		}
		return accountName === "default" && isAuthCredential(entry);
	}

	/**
	 * Get provider-scoped environment values for an API key credential.
	 */
	getProviderEnv(provider: string): Record<string, string> | undefined {
		const cred = this.get(provider);
		return cred?.type === "api_key" && cred.env ? { ...cred.env } : undefined;
	}

	/**
	 * Set credential for a provider.
	 */
	set(provider: string, credential: AuthCredential, accountName?: string): void {
		const entry = this.setCredentialInEntry(this.data[provider], credential, accountName);
		this.data[provider] = entry;
		this.persistProviderChange(provider, entry);
	}

	/**
	 * Remove credential for a provider.
	 */
	remove(provider: string): void {
		delete this.data[provider];
		this.persistProviderChange(provider, undefined);
	}

	/**
	 * Remove one named account for a provider.
	 */
	removeAccount(provider: string, accountName: string): boolean {
		const entry = this.data[provider];
		if (isAuthCredential(entry)) {
			if (accountName !== "default") return false;
			this.remove(provider);
			return true;
		}
		if (!isAuthAccountCollection(entry) || !entry.accounts[accountName]) return false;

		const accounts = { ...entry.accounts };
		delete accounts[accountName];
		const remainingAccountNames = Object.keys(accounts);
		if (remainingAccountNames.length === 0) {
			this.remove(provider);
			return true;
		}

		const nextEntry: AuthAccountCollection = {
			active: entry.active === accountName ? remainingAccountNames[0] : entry.active,
			accounts,
		};
		this.data[provider] = nextEntry;
		this.persistProviderChange(provider, nextEntry);
		return true;
	}

	/**
	 * List all providers with credentials.
	 */
	list(): string[] {
		return Object.keys(this.data);
	}

	/**
	 * Check if credentials exist for a provider in auth.json.
	 */
	has(provider: string): boolean {
		return provider in this.data;
	}

	/**
	 * Check if any form of auth is configured for a provider.
	 * Unlike getApiKey(), this doesn't refresh OAuth tokens.
	 */
	hasAuth(provider: string): boolean {
		if (this.runtimeOverrides.has(provider)) return true;
		if (this.data[provider]) return true;
		if (getEnvApiKey(provider)) return true;
		if (this.fallbackResolver?.(provider)) return true;
		return false;
	}

	/**
	 * Return auth status without exposing credential values or refreshing tokens.
	 */
	getAuthStatus(provider: string): AuthStatus {
		if (this.data[provider]) {
			return { configured: true, source: "stored" };
		}

		if (this.runtimeOverrides.has(provider)) {
			return { configured: false, source: "runtime", label: "runtime API key" };
		}

		const envKeys = findEnvKeys(provider);
		if (envKeys?.[0]) {
			return { configured: false, source: "environment", label: envKeys[0] };
		}

		if (this.fallbackResolver?.(provider)) {
			return { configured: false, source: "fallback", label: "custom provider config" };
		}

		return { configured: false };
	}

	/**
	 * Get all credentials (for passing to getOAuthApiKey).
	 */
	getAll(): Record<string, AuthCredential> {
		const credentials: Record<string, AuthCredential> = {};
		for (const [provider, entry] of Object.entries(this.data)) {
			const credential = this.getActiveCredential(entry);
			if (credential) credentials[provider] = credential;
		}
		return credentials;
	}

	drainErrors(): Error[] {
		const drained = [...this.errors];
		this.errors = [];
		return drained;
	}

	/**
	 * Login to an OAuth provider.
	 */
	async login(providerId: OAuthProviderId, callbacks: OAuthLoginCallbacks, accountName?: string): Promise<void> {
		const provider = getOAuthProvider(providerId);
		if (!provider) {
			throw new Error(`Unknown OAuth provider: ${providerId}`);
		}

		const credentials = await provider.login(callbacks);
		this.set(providerId, { type: "oauth", ...credentials }, accountName);
	}

	/**
	 * Logout from a provider.
	 */
	logout(provider: string): void {
		this.remove(provider);
	}

	/**
	 * Refresh OAuth token with backend locking to prevent race conditions.
	 * Multiple pi instances may try to refresh simultaneously when tokens expire.
	 */
	private async refreshOAuthTokenWithLock(
		providerId: OAuthProviderId,
	): Promise<{ apiKey: string; newCredentials: OAuthCredentials } | null> {
		const provider = getOAuthProvider(providerId);
		if (!provider) {
			return null;
		}

		const result = await this.storage.withLockAsync(async (current) => {
			const currentData = this.parseStorageData(current);
			this.data = currentData;
			this.loadError = null;

			const cred = this.getActiveCredential(currentData[providerId]);
			if (cred?.type !== "oauth") {
				return { result: null };
			}

			if (Date.now() < cred.expires) {
				return { result: { apiKey: provider.getApiKey(cred), newCredentials: cred } };
			}

			const oauthCreds: Record<string, OAuthCredentials> = {};
			for (const [key, value] of Object.entries(currentData)) {
				const credential = this.getActiveCredential(value);
				if (credential?.type === "oauth") {
					oauthCreds[key] = credential;
				}
			}

			const refreshed = await getOAuthApiKey(providerId, oauthCreds);
			if (!refreshed) {
				return { result: null };
			}

			const merged: AuthStorageData = {
				...currentData,
				[providerId]: this.replaceActiveCredential(currentData[providerId], {
					type: "oauth",
					...refreshed.newCredentials,
				}),
			};
			this.data = merged;
			this.loadError = null;
			return { result: refreshed, next: JSON.stringify(merged, null, 2) };
		});

		return result;
	}

	/**
	 * Get API key for a provider.
	 * Priority:
	 * 1. Runtime override
	 * 2. API key from auth.json
	 * 3. OAuth token from auth.json (auto-refreshed with locking)
	 * 4. Environment variable
	 * 5. Fallback resolver (models.json custom providers)
	 */
	async getApiKey(providerId: string, options?: { includeFallback?: boolean }): Promise<string | undefined> {
		// Runtime override takes highest priority
		const runtimeKey = this.runtimeOverrides.get(providerId);
		if (runtimeKey) {
			return runtimeKey;
		}

		const cred = this.get(providerId);

		if (cred?.type === "api_key") {
			return resolveConfigValue(cred.key, cred.env);
		}

		if (cred?.type === "oauth") {
			const provider = getOAuthProvider(providerId);
			if (!provider) {
				// Unknown OAuth provider, can't get API key
				return undefined;
			}

			// Check if token needs refresh
			const needsRefresh = Date.now() >= cred.expires;

			if (needsRefresh) {
				// Use locked refresh to prevent race conditions
				try {
					const result = await this.refreshOAuthTokenWithLock(providerId);
					if (result) {
						return result.apiKey;
					}
				} catch (error) {
					this.recordError(error);
					// Refresh failed - re-read file to check if another instance succeeded
					this.reload();
					const updatedCred = this.get(providerId);

					if (updatedCred?.type === "oauth" && Date.now() < updatedCred.expires) {
						// Another instance refreshed successfully, use those credentials
						return provider.getApiKey(updatedCred);
					}

					// Refresh truly failed - return undefined so model discovery skips this provider
					// User can /account add to re-authenticate (credentials preserved for retry)
					return undefined;
				}
			} else {
				// Token not expired, use current access token
				return provider.getApiKey(cred);
			}
		}

		// Fall back to environment variable
		const envKey = getEnvApiKey(providerId);
		if (envKey) return envKey;

		// Fall back to custom resolver (e.g., models.json custom providers)
		if (options?.includeFallback !== false) {
			return this.fallbackResolver?.(providerId) ?? undefined;
		}

		return undefined;
	}

	/**
	 * Get all registered OAuth providers
	 */
	getOAuthProviders() {
		return getOAuthProviders();
	}
}
