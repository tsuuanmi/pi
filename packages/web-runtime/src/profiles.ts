import { chmodSync, closeSync, existsSync, mkdirSync, openSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

export class ProfileError extends Error {
	constructor(message: string, options?: ErrorOptions) {
		super(message, options);
		this.name = "ProfileError";
	}
}

export interface ProfileLease {
	readonly path: string;
	release(): void;
}

export function acquireProfile(profileDir: string): ProfileLease {
	mkdirSync(profileDir, { recursive: true, mode: 0o700 });
	chmodSync(profileDir, 0o700);
	const lockPath = join(profileDir, ".pi-browser.lock");
	let lock: number;
	try {
		lock = openSync(lockPath, "wx", 0o600);
		writeFileSync(lock, String(process.pid));
	} catch (error) {
		throw new ProfileError("browser profile is already in use", { cause: error });
	}
	let released = false;
	return {
		path: profileDir,
		release() {
			if (released) return;
			released = true;
			closeSync(lock);
			rmSync(lockPath, { force: true });
		},
	};
}

export class BrowserProfiles {
	private readonly root: string;

	constructor(root: string) {
		this.root = root;
	}

	profilePath(profileId: string): string {
		if (!/^[a-zA-Z0-9_-]{16,128}$/.test(profileId)) throw new ProfileError("invalid browser profile id");
		return resolve(this.root, profileId);
	}

	remove(profileId: string): void {
		const profileDir = this.profilePath(profileId);
		if (existsSync(profileDir) && statSync(profileDir).isDirectory())
			rmSync(profileDir, { recursive: true, force: true });
	}
}
