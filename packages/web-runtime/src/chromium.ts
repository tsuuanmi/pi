import { execFile as execFileCallback } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { promisify } from "node:util";
import { type BrowserContext, chromium } from "playwright";

const execFile = promisify(execFileCallback);
const nodeRequire = createRequire(import.meta.url);

export class ChromiumError extends Error {
	constructor(message: string, options?: ErrorOptions) {
		super(message, options);
		this.name = "ChromiumError";
	}
}

export async function ensureChromium(): Promise<void> {
	if (existsSync(chromium.executablePath())) return;
	try {
		await execFile(process.execPath, [nodeRequire.resolve("playwright/cli"), "install", "chromium"]);
	} catch (error) {
		throw new ChromiumError("Pi-managed Chromium provisioning failed", { cause: error });
	}
	if (!existsSync(chromium.executablePath())) throw new ChromiumError("Pi-managed Chromium provisioning failed");
}

export async function launchVisibleChromium(profileDir: string): Promise<BrowserContext> {
	try {
		await ensureChromium();
		return await chromium.launchPersistentContext(profileDir, { headless: false });
	} catch (error) {
		throw new ChromiumError("Pi-managed Chromium is unavailable", { cause: error });
	}
}
