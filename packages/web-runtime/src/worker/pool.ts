import { pathToFileURL } from "node:url";
import type { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";
import { WorkerClient, type WorkerCrashHandler, type WorkerMessageHandler } from "./client.ts";
import type { WorkerMessage, WorkerTurn } from "./protocol.ts";

export interface ProfileWorker {
	open(): Promise<void>;
	start(turn: WorkerTurn): void;
	cancel(turnId: string): void;
	resolveMcp(turnId: string, message: JSONRPCMessage): void;
	close(): Promise<void>;
}

export type ProfileWorkerFactory = (
	profileId: string,
	profileDir: string,
	tunnelSecret: string,
	workerPath: string,
	onMessage: WorkerMessageHandler,
	onCrash: WorkerCrashHandler,
) => ProfileWorker;

interface WorkerEntry {
	profileDir: string;
	tunnelSecret: string;
	workerPath: string;
	worker: ProfileWorker;
	ready: Promise<void>;
	handlers: Map<string, (message: WorkerMessage) => void>;
}

export class ProfileWorkerPool {
	private readonly createWorker: ProfileWorkerFactory;
	private readonly workers = new Map<string, WorkerEntry>();
	private readonly failures = new Map<string, Error>();

	constructor(createWorker?: ProfileWorkerFactory) {
		this.createWorker =
			createWorker ??
			((profileId, profileDir, tunnelSecret, workerPath, onMessage, onCrash) =>
				new WorkerClient(pathToFileURL(workerPath), profileId, profileDir, tunnelSecret, onMessage, onCrash));
	}

	async start(
		profileId: string,
		profileDir: string,
		tunnelSecret: string,
		workerPath: string,
		turn: WorkerTurn,
		onMessage: (message: WorkerMessage) => void,
	): Promise<void> {
		const entry = this.getEntry(profileId, profileDir, tunnelSecret, workerPath);
		await entry.ready;
		if (entry.handlers.has(turn.id)) throw new Error(`turn is already running: ${turn.id}`);
		entry.handlers.set(turn.id, onMessage);
		try {
			entry.worker.start(turn);
		} catch (error) {
			entry.handlers.delete(turn.id);
			throw error;
		}
	}

	cancel(profileId: string, turnId: string): void {
		this.workers.get(profileId)?.worker.cancel(turnId);
	}

	resolveMcp(profileId: string, turnId: string, message: JSONRPCMessage): void {
		this.workers.get(profileId)?.worker.resolveMcp(turnId, message);
	}

	async close(profileId: string): Promise<void> {
		const entry = this.workers.get(profileId);
		if (!entry) {
			this.failures.delete(profileId);
			return;
		}
		this.workers.delete(profileId);
		this.fail(entry, "profile worker closed");
		await entry.worker.close();
		this.failures.delete(profileId);
	}

	async closeAll(): Promise<void> {
		await Promise.all([...this.workers.keys()].map((profileId) => this.close(profileId)));
		this.failures.clear();
	}

	private getEntry(profileId: string, profileDir: string, tunnelSecret: string, workerPath: string): WorkerEntry {
		const failure = this.failures.get(profileId);
		if (failure) throw new Error(`profile worker is unavailable: ${failure.message}`);
		const current = this.workers.get(profileId);
		if (current) {
			if (current.profileDir !== profileDir) throw new Error(`profile path changed: ${profileId}`);
			if (current.tunnelSecret !== tunnelSecret) throw new Error(`profile tunnel secret changed: ${profileId}`);
			if (current.workerPath !== workerPath) throw new Error(`worker path changed: ${profileId}`);
			return current;
		}

		let entry!: WorkerEntry;
		const onMessage: WorkerMessageHandler = (message) => this.route(profileId, message);
		const onCrash: WorkerCrashHandler = (error) => this.crash(profileId, error);
		const worker = this.createWorker(profileId, profileDir, tunnelSecret, workerPath, onMessage, onCrash);
		entry = { profileDir, tunnelSecret, workerPath, worker, ready: Promise.resolve(), handlers: new Map() };
		this.workers.set(profileId, entry);
		entry.ready = worker.open().catch(async (error: unknown) => {
			if (this.workers.get(profileId) === entry) this.workers.delete(profileId);
			const failure = error instanceof Error ? error : new Error(String(error));
			this.failures.set(profileId, failure);
			await worker.close().catch(() => undefined);
			throw failure;
		});
		return entry;
	}

	private route(profileId: string, message: WorkerMessage): void {
		const entry = this.workers.get(profileId);
		if (!entry) return;
		if (message.type === "profile-ready" || message.type === "profile-closed" || message.type === "profile-error")
			return;
		const handler = entry.handlers.get(message.turnId);
		if (!handler) return;
		handler(message);
		if (message.type === "complete" || message.type === "error") entry.handlers.delete(message.turnId);
	}

	private crash(profileId: string, error: Error): void {
		const entry = this.workers.get(profileId);
		if (!entry) return;
		this.workers.delete(profileId);
		this.failures.set(profileId, error);
		this.fail(entry, error.message);
		void entry.worker.close().catch(() => undefined);
	}

	private fail(entry: WorkerEntry, message: string): void {
		for (const [turnId, handler] of entry.handlers) handler({ type: "error", turnId, message });
		entry.handlers.clear();
	}
}
