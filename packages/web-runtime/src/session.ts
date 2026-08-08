import type { BrowserContext, Page } from "playwright";
import { launchVisibleChromium } from "./chromium.ts";
import { acquireProfile, type ProfileLease } from "./profiles.ts";

const MAX_TURNS = 5;

export class SessionError extends Error {
	constructor(message: string, options?: ErrorOptions) {
		super(message, options);
		this.name = "SessionError";
	}
}

export class BrowserSession {
	private readonly lease: ProfileLease;
	private readonly context: BrowserContext;
	private readonly pages = new Map<string, Page>();
	private readonly opening = new Set<string>();
	private openingDone?: Promise<void>;
	private finishOpening?: () => void;
	private closePromise?: Promise<void>;
	private closed = false;

	private constructor(lease: ProfileLease, context: BrowserContext) {
		this.lease = lease;
		this.context = context;
	}

	static async open(profileDir: string): Promise<BrowserSession> {
		const lease = acquireProfile(profileDir);
		try {
			return new BrowserSession(lease, await launchVisibleChromium(lease.path));
		} catch (error) {
			lease.release();
			throw new SessionError("browser session could not be opened", { cause: error });
		}
	}

	async openTurn(turnId: string): Promise<Page> {
		if (this.closed) throw new SessionError("browser session is closed");
		if (this.pages.has(turnId) || this.opening.has(turnId)) throw new SessionError(`turn is already open: ${turnId}`);
		if (this.pages.size + this.opening.size >= MAX_TURNS)
			throw new SessionError("temporary ChatGPT tab limit reached");
		if (this.opening.size === 0) {
			this.openingDone = new Promise<void>((resolve) => {
				this.finishOpening = resolve;
			});
		}
		this.opening.add(turnId);
		try {
			const page = await this.context.newPage();
			if (this.closed) {
				await page.close();
				throw new SessionError("browser session is closed");
			}
			this.pages.set(turnId, page);
			return page;
		} finally {
			this.opening.delete(turnId);
			if (this.opening.size === 0) {
				this.finishOpening?.();
				this.finishOpening = undefined;
				this.openingDone = undefined;
			}
		}
	}

	async closeTurn(turnId: string): Promise<void> {
		const page = this.pages.get(turnId);
		if (!page) return;
		this.pages.delete(turnId);
		await page.close();
	}

	async close(): Promise<void> {
		if (this.closePromise) return this.closePromise;
		this.closed = true;
		this.closePromise = (async () => {
			try {
				await this.openingDone;
				await Promise.all([...this.pages.keys()].map((turnId) => this.closeTurn(turnId)));
			} finally {
				try {
					await this.context.close();
				} finally {
					this.lease.release();
				}
			}
		})();
		return this.closePromise;
	}
}
