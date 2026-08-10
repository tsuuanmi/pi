import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CHATGPT_WEB_PROVIDER_ID } from "@tsuuanmi/pi-web-runtime";
import { afterEach, describe, expect, test } from "vitest";
import type { AuthStorage } from "#pi/auth/storage";
import type { BrowserCredential } from "#pi/auth/types";
import { BrowserAccountStore } from "#pi/web-providers/accounts";
import type { WebProviderHost } from "#pi/web-providers/host";

const directories: string[] = [];

afterEach(() => {
	for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function createStorage(): AuthStorage {
	const accounts = new Map<string, BrowserCredential>();
	return {
		set: (_provider: string, credential: unknown, name?: string) =>
			accounts.set(name ?? "default", credential as BrowserCredential),
		getBrowserAccount: (_provider: string, name?: string) => accounts.get(name ?? "default"),
		removeAccount: (_provider: string, name: string) => accounts.delete(name),
	} as unknown as AuthStorage;
}

describe("BrowserAccountStore", () => {
	test("removes the profile when verification fails before persisting credentials", async () => {
		const root = mkdtempSync(join(tmpdir(), "pi-browser-account-"));
		directories.push(root);
		const storage = createStorage();
		const store = new BrowserAccountStore(storage, root);
		const host = {
			verify: async (_provider: string, profileDir: string) => {
				mkdirSync(profileDir, { recursive: true });
				throw new Error("verification failed");
			},
		} as unknown as WebProviderHost;

		await expect(store.add(CHATGPT_WEB_PROVIDER_ID, "work", host, new AbortController().signal)).rejects.toThrow(
			"verification failed",
		);
		expect(existsSync(root)).toBe(true);
		expect(readdirSync(root)).toEqual([]);
		expect(storage.getBrowserAccount(CHATGPT_WEB_PROVIDER_ID, "work")).toBeUndefined();
	});

	test("removes credentials and profiles when entitlement storage fails", async () => {
		const root = mkdtempSync(join(tmpdir(), "pi-browser-account-"));
		directories.push(root);
		const storage = createStorage();
		const store = new BrowserAccountStore(storage, root);
		const host = {
			verify: async (_provider: string, profileDir: string) => {
				mkdirSync(profileDir, { recursive: true });
				return { routes: ["high"] };
			},
			setEntitlement: () => {
				throw new Error("entitlement storage failed");
			},
		} as unknown as WebProviderHost;

		await expect(store.add(CHATGPT_WEB_PROVIDER_ID, "work", host, new AbortController().signal)).rejects.toThrow(
			"entitlement storage failed",
		);
		expect(readdirSync(root)).toEqual([]);
		expect(storage.getBrowserAccount(CHATGPT_WEB_PROVIDER_ID, "work")).toBeUndefined();
	});
});
