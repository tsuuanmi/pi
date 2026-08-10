import { randomBytes, randomUUID } from "node:crypto";
import { rmSync } from "node:fs";
import { join } from "node:path";
import type { AuthStorage } from "#pi/auth/storage";
import type { BrowserCredential } from "#pi/auth/types";
import { getAgentDir } from "#pi/loader/paths";
import type { WebProviderHost } from "#pi/web-providers/host";
import { closeWebProfile } from "./workers.ts";

export const WEB_PROFILE_DIR = join(getAgentDir(), "browser-profiles");

export function getBrowserProfilePath(profileId: string, root: string = WEB_PROFILE_DIR): string {
	if (!/^[a-zA-Z0-9_-]{16,128}$/.test(profileId)) throw new Error("invalid browser profile id");
	return join(root, profileId);
}

/** Coordinates browser verification and the final credential commit. */
export class BrowserAccountStore {
	private readonly authStorage: AuthStorage;
	private readonly profileRoot: string;

	constructor(authStorage: AuthStorage, profileRoot: string = WEB_PROFILE_DIR) {
		this.authStorage = authStorage;
		this.profileRoot = profileRoot;
	}

	async add(provider: string, name: string, host: WebProviderHost, signal: AbortSignal): Promise<BrowserCredential> {
		if (!name || name.trim() !== name || /[\x00/\\]/.test(name)) throw new Error("invalid browser account name");
		const credential: BrowserCredential = {
			type: "browser",
			profileId: randomUUID().replaceAll("-", ""),
			tunnelSecret: randomBytes(32).toString("base64url"),
		};
		const profileDir = join(this.profileRoot, credential.profileId);
		let persisted = false;
		try {
			const entitlement = await host.verify(provider, profileDir, signal);
			if (signal.aborted) throw signal.reason;
			if (entitlement.routes.length === 0) throw new Error("browser account has no entitled routes");
			this.authStorage.set(provider, credential, name);
			persisted = true;
			host.setEntitlement(provider, name, entitlement.routes);
			return credential;
		} catch (error) {
			if (persisted) this.authStorage.removeAccount(provider, name);
			rmSync(profileDir, { recursive: true, force: true });
			throw error;
		}
	}

	async activate(provider: string, name: string, host: WebProviderHost, signal: AbortSignal): Promise<void> {
		const credential = this.authStorage.getBrowserAccount(provider, name);
		if (!credential) throw new Error(`unknown browser account: ${name}`);
		const entitlement = await host.verify(
			provider,
			getBrowserProfilePath(credential.profileId, this.profileRoot),
			signal,
		);
		if (signal.aborted) throw signal.reason;
		if (entitlement.routes.length === 0) throw new Error("browser account has no entitled routes");
		this.authStorage.switchAccount(provider, name);
		host.clearEntitlement(provider);
		host.setEntitlement(provider, name, entitlement.routes);
	}

	async remove(provider: string, name: string, host: WebProviderHost): Promise<void> {
		const credential = this.authStorage.getBrowserAccount(provider, name);
		if (!credential) throw new Error(`Unknown browser account: ${name}`);
		const active = this.authStorage.getActiveAccount(provider) === name;
		await closeWebProfile(credential.profileId);
		rmSync(getBrowserProfilePath(credential.profileId, this.profileRoot), { recursive: true, force: true });
		this.authStorage.removeAccount(provider, name);
		if (active) host.clearEntitlement(provider);
	}
}
