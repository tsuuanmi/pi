import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { serializeJsonLine } from "@tsuuanmi/pi-agent/node";

export interface RpcStateSnapshot {
	isStreaming: boolean;
	steeringQueueDepth: number;
	followupQueueDepth: number;
}

export interface HarnessRpc {
	getState(): Promise<RpcStateSnapshot>;
	sendPrompt(prompt: string): Promise<{ commandId: string; ack: boolean }>;
	eventCursor(): number;
	waitForAgentStart(afterCursor: number, timeoutMs: number): Promise<{ cursor: number } | null>;
	close(): Promise<void>;
	onEventFrame?(listener: (frame: Record<string, unknown>) => void): () => void;
	isLive?(): boolean;
	lastFrameAt?(): string | null;
	pid?(): number | null;
}

export interface AcceptanceResult {
	accepted: boolean;
	reason: string;
	commandId: string | null;
	preSubmitCursor: number;
	agentStartCursor: number | null;
	preSubmitState: RpcStateSnapshot;
}

export async function singleFlightAccept(
	rpc: HarnessRpc,
	prompt: string,
	timeoutMs: number,
): Promise<AcceptanceResult> {
	const pre = await rpc.getState();
	const preSubmitCursor = rpc.eventCursor();
	if (pre.isStreaming || pre.steeringQueueDepth > 0 || pre.followupQueueDepth > 0) {
		return {
			accepted: false,
			reason: "pre-state-not-idle",
			commandId: null,
			preSubmitCursor,
			agentStartCursor: null,
			preSubmitState: pre,
		};
	}
	const { commandId, ack } = await rpc.sendPrompt(prompt);
	if (!ack) {
		return {
			accepted: false,
			reason: "no-ack",
			commandId,
			preSubmitCursor,
			agentStartCursor: null,
			preSubmitState: pre,
		};
	}
	const started = await rpc.waitForAgentStart(preSubmitCursor, timeoutMs);
	if (!started) {
		return {
			accepted: false,
			reason: "no-agent-start-within-timeout",
			commandId,
			preSubmitCursor,
			agentStartCursor: null,
			preSubmitState: pre,
		};
	}
	return {
		accepted: true,
		reason: "protocol-ack-single-flight",
		commandId,
		preSubmitCursor,
		agentStartCursor: started.cursor,
		preSubmitState: pre,
	};
}

interface PendingResponse {
	resolve: (value: Record<string, unknown>) => void;
	reject: (error: Error) => void;
}

function defaultRpcCommand(): string[] {
	const configured = process.env.PI_HARNESS_RPC_COMMAND?.trim();
	if (configured) return configured.split(/\s+/);
	return ["pi", "--mode", "rpc"];
}

export class PiRpc implements HarnessRpc {
	#proc: ChildProcessWithoutNullStreams;
	#buffer = "";
	#cursor = 0;
	#pending = new Map<string, PendingResponse>();
	#agentStartCursors: number[] = [];
	#waiters: Array<{
		afterCursor: number;
		resolve: (value: { cursor: number } | null) => void;
		timer: NodeJS.Timeout;
	}> = [];
	#frameListeners: Array<(frame: Record<string, unknown>) => void> = [];
	#lastFrameAt: string | null = null;
	#alive = true;

	constructor(opts: { cwd: string; sessionDir: string; command?: string[]; env?: NodeJS.ProcessEnv }) {
		const command = opts.command ?? defaultRpcCommand();
		const [bin, ...baseArgs] = command;
		if (!bin) throw new Error("empty Pi RPC command");
		this.#proc = spawn(bin, baseArgs, {
			cwd: opts.cwd,
			env: { ...process.env, ...(opts.env ?? {}), PI_SESSION_DIR: opts.sessionDir },
			stdio: ["pipe", "pipe", "pipe"],
		}) as ChildProcessWithoutNullStreams;
		this.#proc.stdout.setEncoding("utf8");
		this.#proc.stdout.on("data", (chunk) => this.#onData(String(chunk)));
		this.#proc.on("exit", () => {
			this.#alive = false;
		});
		this.#proc.on("error", () => {
			this.#alive = false;
		});
	}

	pid(): number | null {
		return this.#proc.pid ?? null;
	}

	#onData(chunk: string): void {
		this.#buffer += chunk;
		let index = this.#buffer.indexOf("\n");
		while (index >= 0) {
			const line = this.#buffer.slice(0, index).trim();
			this.#buffer = this.#buffer.slice(index + 1);
			if (line) this.#onFrame(line);
			index = this.#buffer.indexOf("\n");
		}
	}

	#onFrame(line: string): void {
		let frame: Record<string, unknown>;
		try {
			frame = JSON.parse(line) as Record<string, unknown>;
		} catch {
			return;
		}
		if (frame.type === "response") {
			const id = typeof frame.id === "string" ? frame.id : undefined;
			const pending = id ? this.#pending.get(id) : undefined;
			if (id && pending) {
				this.#pending.delete(id);
				pending.resolve(frame);
			}
			return;
		}
		this.#cursor += 1;
		this.#lastFrameAt = new Date().toISOString();
		if (frame.type === "agent_start") {
			const cursor = this.#cursor;
			this.#agentStartCursors.push(cursor);
			this.#waiters = this.#waiters.filter((waiter) => {
				if (cursor > waiter.afterCursor) {
					clearTimeout(waiter.timer);
					waiter.resolve({ cursor });
					return false;
				}
				return true;
			});
		}
		for (const listener of this.#frameListeners) {
			try {
				listener(frame);
			} catch {}
		}
	}

	#send(command: Record<string, unknown>): Promise<Record<string, unknown>> {
		const id = randomUUID();
		return new Promise((resolve, reject) => {
			this.#pending.set(id, { resolve, reject });
			this.#proc.stdin.write(serializeJsonLine({ id, ...command }), (error) => {
				if (error) {
					this.#pending.delete(id);
					reject(error);
				}
			});
		});
	}

	onEventFrame(listener: (frame: Record<string, unknown>) => void): () => void {
		this.#frameListeners.push(listener);
		return () => {
			this.#frameListeners = this.#frameListeners.filter((item) => item !== listener);
		};
	}

	isLive(): boolean {
		return this.#alive;
	}

	lastFrameAt(): string | null {
		return this.#lastFrameAt;
	}

	async getState(): Promise<RpcStateSnapshot> {
		const res = await this.#send({ type: "get_state" });
		const data = (res.data ?? {}) as Record<string, unknown>;
		return {
			isStreaming: data.isStreaming === true,
			steeringQueueDepth: typeof data.pendingMessageCount === "number" ? data.pendingMessageCount : 0,
			followupQueueDepth: 0,
		};
	}

	async sendPrompt(prompt: string): Promise<{ commandId: string; ack: boolean }> {
		const id = randomUUID();
		const res = await new Promise<Record<string, unknown>>((resolve, reject) => {
			this.#pending.set(id, { resolve, reject });
			this.#proc.stdin.write(serializeJsonLine({ id, type: "prompt", message: prompt }), (error) => {
				if (error) {
					this.#pending.delete(id);
					reject(error);
				}
			});
		});
		return { commandId: id, ack: res.success === true };
	}

	eventCursor(): number {
		return this.#cursor;
	}

	waitForAgentStart(afterCursor: number, timeoutMs: number): Promise<{ cursor: number } | null> {
		const existing = this.#agentStartCursors.find((cursor) => cursor > afterCursor);
		if (existing !== undefined) return Promise.resolve({ cursor: existing });
		return new Promise((resolve) => {
			const timer = setTimeout(() => {
				this.#waiters = this.#waiters.filter((waiter) => waiter.timer !== timer);
				resolve(null);
			}, timeoutMs);
			this.#waiters.push({ afterCursor, resolve, timer });
		});
	}

	async close(): Promise<void> {
		try {
			this.#proc.stdin.end();
		} catch {}
		this.#proc.kill();
	}
}
