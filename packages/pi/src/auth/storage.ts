/**
 * Credential storage for API keys and OAuth tokens.
 * Handles loading, saving, and refreshing credentials from auth.json.
 *
 * Uses file locking to prevent race conditions when multiple pi instances
 * try to refresh tokens simultaneously.
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { normalizePath } from "@tsuuanmi/pi-agent/node";
import {
	getOAuthProvider,
	getOAuthProviders,
	type OAuthLoginCallbacks,
	type OAuthProviderId,
} from "@tsuuanmi/pi-ai/oauth";
import lockfile from "proper-lockfile";
import { assertAuthName, isAuthAccountCollection, isAuthCredential, parseAuth, serializeAuth } from "#pi/auth/codec";
import type {
	AuthAccountCollection,
	AuthCredential,
	AuthStatus,
	AuthStorageData,
	AuthStorageEntry,
	BrowserCredential,
	OAuthCredential,
} from "#pi/auth/types";
import { getAgentDir } from "#pi/loader/paths";
import { resolveConfigValue } from "#pi/loader/value";
import { assertPrivateFile, ensurePrivateDir, writePrivateFile } from "#pi/storage/file";

type LockResult<T> = {
	result: T;
	next?: string;
};

export interface AuthStorageBackend {
	withLock<T>(fn: (current: string | undefined) => LockResult<T>): T;
	withLockAsync<T>(fn: (current: string | undefined) => Promise<LockResult<T>>): Promise<T>;
}

export class FileAuthStorageBackend implements AuthStorageBackend {
	private readonly authPath: string;

	constructor(authPath: string = join(getAgentDir(), "auth.json")) {
		this.authPath = normalizePath(authPath);
	}

	private ensureDirectory(): void {
		ensurePrivateDir(dirname(this.authPath));
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
		this.ensureDirectory();
		const release = this.acquireLockSyncWithRetry(this.authPath);
		try {
			if (existsSync(this.authPath)) assertPrivateFile(this.authPath);
			const current = existsSync(this.authPath) ? readFileSync(this.authPath, "utf8") : undefined;
			const { result, next } = fn(current);
			if (next !== undefined) writePrivateFile(this.authPath, next);
			return result;
		} finally {
			release();
		}
	}

	async withLockAsync<T>(fn: (current: string | undefined) => Promise<LockResult<T>>): Promise<T> {
		this.ensureDirectory();
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
			if (existsSync(this.authPath)) assertPrivateFile(this.authPath);
			const current = existsSync(this.authPath) ? readFileSync(this.authPath, "utf8") : undefined;
			const { result, next } = await fn(current);
			throwIfCompromised();
			if (next !== undefined) writePrivateFile(this.authPath, next);
			throwIfCompromised();
			return result;
		} finally {
			if (release) await release();
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
	private readonly runtimeOverrides = new Map<string, string>();
	private readonly storage: AuthStorageBackend;

	private constructor(storage: AuthStorageBackend) {
		this.storage = storage;
		this.reload();
	}

	private entry(provider: string): AuthStorageEntry | undefined {
		return Object.hasOwn(this.data, provider) ? this.data[provider] : undefined;
	}

	private static copyCredential(credential: AuthCredential): AuthCredential {
		return credential.type === "api_key" && credential.env
			? { ...credential, env: { ...credential.env } }
			: { ...credential };
	}

	static create(authPath?: string): AuthStorage {
		return new AuthStorage(new FileAuthStorageBackend(authPath));
	}

	static fromStorage(storage: AuthStorageBackend): AuthStorage {
		return new AuthStorage(storage);
	}

	static inMemory(data: AuthStorageData = {}): AuthStorage {
		const storage = new InMemoryAuthStorageBackend();
		storage.withLock(() => ({ result: undefined, next: serializeAuth(data) }));
		return AuthStorage.fromStorage(storage);
	}

	/**
	 * Set a runtime API key override (not persisted to disk).
	 */
	setRuntimeApiKey(provider: string, apiKey: string): void {
		if (!provider || provider.trim() !== provider || /[\x00/\\]/.test(provider)) {
			throw new Error("Provider name is invalid.");
		}
		if (!apiKey) throw new Error("Runtime API key must not be empty.");
		this.runtimeOverrides.set(provider, apiKey);
	}

	/**
	 * Remove a runtime API key override.
	 */
	removeRuntimeApiKey(provider: string): void {
		if (!this.runtimeOverrides.delete(provider)) throw new Error(`No runtime API key for ${provider}.`);
	}

	private getActiveAccountName(entry: AuthStorageEntry | undefined): string | undefined {
		return isAuthAccountCollection(entry) ? entry.active : undefined;
	}

	private getActiveCredential(entry: AuthStorageEntry | undefined): AuthCredential | undefined {
		return this.getAccountCredential(entry, this.getActiveAccountName(entry));
	}

	private getAccountCredential(
		entry: AuthStorageEntry | undefined,
		accountName: string | undefined,
	): AuthCredential | undefined {
		if (isAuthCredential(entry)) return accountName === undefined || accountName === "default" ? entry : undefined;
		if (!isAuthAccountCollection(entry)) return undefined;

		const resolvedAccount = accountName ?? this.getActiveAccountName(entry);
		return resolvedAccount ? entry.accounts[resolvedAccount] : undefined;
	}

	private setCredentialInEntry(
		entry: AuthStorageEntry | undefined,
		credential: AuthCredential,
		accountName?: string,
	): AuthStorageEntry {
		if (accountName === undefined) {
			if (isAuthAccountCollection(entry)) {
				return {
					active: entry.active,
					accounts: { ...entry.accounts, [entry.active]: credential },
				};
			}
			return credential;
		}

		let accounts: Record<string, AuthCredential>;
		if (isAuthAccountCollection(entry)) {
			accounts = { ...entry.accounts };
		} else if (isAuthCredential(entry)) {
			accounts = { default: entry };
		} else {
			accounts = {};
		}

		accounts[accountName] = credential;
		return { active: accountName, accounts };
	}

	private replaceCredentialInEntry(
		entry: AuthStorageEntry | undefined,
		credential: AuthCredential,
		accountName?: string,
	): AuthStorageEntry {
		if (!isAuthAccountCollection(entry)) return credential;
		const targetAccount = accountName ?? entry.active;
		return {
			active: entry.active,
			accounts: { ...entry.accounts, [targetAccount]: credential },
		};
	}

	/**
	 * Reload credentials from storage.
	 */
	reload(): void {
		const data = this.storage.withLock((current) => ({
			result: parseAuth(current ?? "{}", "auth"),
		}));
		this.data = data;
	}

	private persistProviderChange(provider: string, entry: AuthStorageEntry | undefined): AuthStorageData {
		return this.storage.withLock((current) => {
			const data = parseAuth(current ?? "{}", "auth");
			if (entry) data[provider] = entry;
			else delete data[provider];
			const next = serializeAuth(data);
			return { result: parseAuth(next, "auth"), next };
		});
	}

	/**
	 * Get credential for a provider.
	 */
	get(provider: string): AuthCredential | undefined {
		const credential = this.getActiveCredential(this.entry(provider));
		return credential ? AuthStorage.copyCredential(credential) : undefined;
	}

	/**
	 * Get credential for a specific stored account.
	 */
	getAccount(provider: string, accountName: string): AuthCredential | undefined {
		const credential = this.getAccountCredential(this.entry(provider), accountName);
		return credential ? AuthStorage.copyCredential(credential) : undefined;
	}

	/**
	 * Get names for stored accounts for a provider.
	 */
	getAccountNames(provider: string): string[] {
		const entry = this.entry(provider);
		if (isAuthAccountCollection(entry)) return Object.keys(entry.accounts);
		if (isAuthCredential(entry)) return ["default"];
		return [];
	}

	/**
	 * Get the active stored account name for a provider.
	 */
	getActiveAccount(provider: string): string | undefined {
		const entry = this.entry(provider);
		if (isAuthAccountCollection(entry)) return this.getActiveAccountName(entry);
		if (isAuthCredential(entry)) return "default";
		return undefined;
	}

	/**
	 * Switch the active account for a provider.
	 */
	switchAccount(provider: string, accountName: string): void {
		assertAuthName(accountName, "account name");
		const entry = this.entry(provider);
		if (isAuthCredential(entry)) {
			if (accountName !== "default") throw new Error(`Account ${accountName} not found for ${provider}.`);
			return;
		}
		if (!entry?.accounts[accountName]) throw new Error(`Account ${accountName} not found for ${provider}.`);
		const nextEntry: AuthAccountCollection = { ...entry, active: accountName };
		this.data = this.persistProviderChange(provider, nextEntry);
	}

	/**
	 * Get provider-scoped environment values for an API key credential.
	 */
	getProviderEnv(provider: string): Record<string, string> | undefined {
		const cred = this.get(provider);
		return cred?.type === "api_key" && cred.env ? { ...cred.env } : undefined;
	}

	getBrowserAccount(provider: string, accountName?: string): BrowserCredential | undefined {
		const credential = accountName === undefined ? this.get(provider) : this.getAccount(provider, accountName);
		return credential?.type === "browser" ? credential : undefined;
	}

	/**
	 * Set credential for a provider.
	 */
	set(provider: string, credential: AuthCredential, accountName?: string): void {
		if (accountName !== undefined) assertAuthName(accountName, "account name");
		const entry = this.setCredentialInEntry(this.entry(provider), credential, accountName);
		this.data = this.persistProviderChange(provider, entry);
	}

	/**
	 * Remove credential for a provider.
	 */
	remove(provider: string): void {
		if (!Object.hasOwn(this.data, provider)) throw new Error(`No credentials stored for ${provider}.`);
		this.data = this.persistProviderChange(provider, undefined);
	}

	/**
	 * Remove one named account for a provider.
	 */
	removeAccount(provider: string, accountName: string): void {
		assertAuthName(accountName, "account name");
		const entry = this.entry(provider);
		if (isAuthCredential(entry)) {
			if (accountName !== "default") throw new Error(`Account ${accountName} not found for ${provider}.`);
			this.remove(provider);
			return;
		}
		if (!entry?.accounts[accountName]) throw new Error(`Account ${accountName} not found for ${provider}.`);
		const accountNames = Object.keys(entry.accounts);
		if (entry.active === accountName && accountNames.length > 1) {
			throw new Error(`Switch ${provider} to another account before removing ${accountName}.`);
		}
		if (accountNames.length === 1) {
			this.remove(provider);
			return;
		}
		const accounts = { ...entry.accounts };
		delete accounts[accountName];
		const nextEntry: AuthAccountCollection = { active: entry.active, accounts };
		this.data = this.persistProviderChange(provider, nextEntry);
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
		return Object.hasOwn(this.data, provider);
	}

	/**
	 * Check if any form of auth is configured for a provider.
	 * Unlike getApiKey(), this doesn't refresh OAuth tokens.
	 */
	hasAuth(provider: string): boolean {
		return this.runtimeOverrides.has(provider) || Object.hasOwn(this.data, provider);
	}

	/**
	 * Return auth status without exposing credential values or refreshing tokens.
	 */
	getAuthStatus(provider: string): AuthStatus {
		if (this.runtimeOverrides.has(provider)) {
			return { configured: true, source: "runtime", label: "runtime API key" };
		}

		if (Object.hasOwn(this.data, provider)) {
			return { configured: true, source: "stored" };
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
			if (credential) credentials[provider] = AuthStorage.copyCredential(credential);
		}
		return credentials;
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
		accountName?: string,
	): Promise<{ apiKey: string; newCredentials: OAuthCredential } | null> {
		const provider = getOAuthProvider(providerId);
		if (!provider) throw new Error(`Unknown OAuth provider: ${providerId}`);

		const outcome = await this.storage.withLockAsync<{
			data: AuthStorageData;
			refreshed: { apiKey: string; newCredentials: OAuthCredential } | null;
		}>(async (current) => {
			const data = parseAuth(current ?? "{}", "auth");
			const credential = this.getAccountCredential(data[providerId], accountName);
			if (credential?.type !== "oauth") return { result: { data, refreshed: null } };
			if (Date.now() < credential.expires) {
				return {
					result: {
						data,
						refreshed: { apiKey: provider.getApiKey(credential), newCredentials: credential },
					},
				};
			}

			const nextCredentials: OAuthCredential = { type: "oauth", ...(await provider.refreshToken(credential)) };
			const refreshed = { apiKey: provider.getApiKey(nextCredentials), newCredentials: nextCredentials };
			data[providerId] = this.replaceCredentialInEntry(data[providerId], nextCredentials, accountName);
			return { result: { data, refreshed }, next: serializeAuth(data) };
		});
		this.data = outcome.data;
		return outcome.refreshed;
	}

	/**
	 * Get API key for a provider.
	 * Priority:
	 * 1. Runtime override
	 * 2. API key from auth.json
	 * 3. OAuth token from auth.json (auto-refreshed with locking)
	 */
	async getApiKey(providerId: string, options?: { accountName?: string }): Promise<string | undefined> {
		// Runtime override takes highest priority
		const runtimeKey = this.runtimeOverrides.get(providerId);
		if (runtimeKey) {
			return runtimeKey;
		}

		const cred =
			options?.accountName !== undefined ? this.getAccount(providerId, options.accountName) : this.get(providerId);

		if (cred?.type === "api_key") {
			const resolved = resolveConfigValue(cred.key, cred.env);
			if (resolved === undefined) {
				throw new Error(`${providerId} API key could not be resolved.`);
			}
			return resolved;
		}

		if (cred?.type === "oauth") {
			const provider = getOAuthProvider(providerId);
			if (!provider) throw new Error(`Unknown OAuth provider: ${providerId}`);

			// Check if token needs refresh
			const needsRefresh = Date.now() >= cred.expires;

			if (needsRefresh) {
				const result = await this.refreshOAuthTokenWithLock(providerId, options?.accountName);
				if (!result) throw new Error(`OAuth credentials for ${providerId} changed during refresh.`);
				return result.apiKey;
			} else {
				// Token not expired, use current access token
				return provider.getApiKey(cred);
			}
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
