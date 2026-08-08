import { Worker } from "node:worker_threads";
import type { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";
import { matchesProof, tunnelProof } from "./auth.ts";
import type { ProfileWorker } from "./pool.ts";
import type { WorkerMessage, WorkerRequest, WorkerTurn } from "./protocol.ts";

export type WorkerMessageHandler = (message: WorkerMessage) => void;
export type WorkerCrashHandler = (error: Error) => void;

export class WorkerClient implements ProfileWorker {
	private readonly url: URL;
	private readonly profileId: string;
	private readonly profileDir: string;
	private readonly tunnelSecret: string;
	private readonly onMessage: WorkerMessageHandler;
	private readonly onCrash: WorkerCrashHandler;
	private worker?: Worker;
	private opening?: Promise<void>;
	private closePromise?: Promise<void>;
	private resolveOpen?: () => void;
	private rejectOpen?: (error: Error) => void;
	private resolveClose?: () => void;
	private rejectClose?: (error: Error) => void;
	private ready = false;
	private closing = false;
	private failed = false;

	constructor(
		url: URL,
		profileId: string,
		profileDir: string,
		tunnelSecret: string,
		onMessage: WorkerMessageHandler,
		onCrash: WorkerCrashHandler,
	) {
		this.url = url;
		this.profileId = profileId;
		this.profileDir = profileDir;
		this.tunnelSecret = tunnelSecret;
		this.onMessage = onMessage;
		this.onCrash = onCrash;
	}

	async open(): Promise<void> {
		if (this.ready) return;
		if (this.opening) return this.opening;
		if (this.failed) throw new Error("profile worker has failed");
		const worker = new Worker(this.url);
		this.worker = worker;
		this.opening = new Promise<void>((resolve, reject) => {
			this.resolveOpen = resolve;
			this.rejectOpen = reject;
			worker.on("message", (message: WorkerMessage) => this.handleMessage(message));
			worker.on("error", (error: Error) => this.fail(error));
			worker.on("exit", (code) => {
				if (this.closing) {
					this.resolveClose?.();
					return;
				}
				this.fail(new Error(`profile worker exited with code ${code}`));
			});
		});
		try {
			worker.postMessage({
				type: "open-profile",
				profileId: this.profileId,
				profileDir: this.profileDir,
				tunnelSecret: this.tunnelSecret,
			} satisfies WorkerRequest);
			await this.opening;
		} finally {
			this.opening = undefined;
			this.resolveOpen = undefined;
			this.rejectOpen = undefined;
		}
	}

	start(turn: WorkerTurn): void {
		if (!this.worker || !this.ready || this.failed || this.closing) throw new Error("profile worker is not ready");
		this.worker.postMessage({ type: "start-turn", turn } satisfies WorkerRequest);
	}

	cancel(turnId: string): void {
		this.post({ type: "cancel-turn", turnId });
	}

	resolveMcp(turnId: string, message: JSONRPCMessage): void {
		this.post({ type: "mcp-response", turnId, message });
	}

	async close(): Promise<void> {
		const worker = this.worker;
		if (!worker) return;
		if (this.failed) {
			this.worker = undefined;
			await worker.terminate();
			return;
		}
		if (this.closePromise) return this.closePromise;
		this.closing = true;
		this.closePromise = new Promise<void>((resolve, reject) => {
			this.resolveClose = resolve;
			this.rejectClose = reject;
			worker.postMessage({ type: "close-profile" } satisfies WorkerRequest);
		});
		try {
			await this.closePromise;
		} finally {
			this.worker = undefined;
			this.resolveClose = undefined;
			this.rejectClose = undefined;
			await worker.terminate();
		}
	}

	private post(request: WorkerRequest): void {
		if (!this.worker || this.failed) throw new Error("profile worker is unavailable");
		this.worker.postMessage(request);
	}

	private handleMessage(message: WorkerMessage): void {
		if (message.type === "profile-ready") {
			const expected = tunnelProof(this.profileId, this.profileDir, this.tunnelSecret);
			if (message.profileId !== this.profileId || !matchesProof(expected, message.proof)) {
				this.fail(new Error("profile worker returned an invalid handshake"));
				return;
			}
			this.ready = true;
			this.resolveOpen?.();
			return;
		}
		if (message.type === "profile-error") {
			const error = new Error(message.message);
			this.rejectOpen?.(error);
			if (!this.closing) this.fail(error);
			return;
		}
		if (message.type === "profile-closed") {
			this.resolveClose?.();
			return;
		}
		this.onMessage(message);
	}

	private fail(error: Error): void {
		if (this.failed) return;
		this.failed = true;
		this.rejectOpen?.(error);
		this.rejectClose?.(error);
		this.onCrash(error);
	}
}
