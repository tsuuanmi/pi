import { randomUUID } from "node:crypto";
import { getSubagentManagerFactory, type SubagentManager } from "@tsuuanmi/pi-agent";
import { ControlServer, type EndpointRequest } from "./endpoint.ts";
import {
	acquireLease,
	canWriteEvents,
	classifyLeaseStatus,
	heartbeat,
	readLease,
	releaseLease,
	type SessionLease,
} from "./lease.ts";
import {
	buildClassificationInput,
	classifyPrimitive,
	finalizePrimitive,
	recoverPrimitive,
	validatePrimitive,
} from "./primitives.ts";
import { type HarnessRpc, singleFlightAccept } from "./rpc.ts";
import { operate } from "./runner.ts";
import { buildResponse, buildStateView, nextAllowedActions, submitUnavailableReason } from "./state.ts";
import {
	appendEvent,
	readEvents,
	readRuntimeReceipts,
	readSessionState,
	sessionPaths,
	writeSessionState,
} from "./storage.ts";
import type { Observation, PrimitiveResponse, SessionState } from "./types.ts";

const DEFAULT_TTL_MS = 30_000;
const DEFAULT_HEARTBEAT_MS = 10_000;
const DEFAULT_ACCEPTANCE_TIMEOUT_MS = 60_000;

export interface OwnerOptions {
	root: string;
	sessionId: string;
	rpc: HarnessRpc;
	ownerId?: string;
	ttlMs?: number;
	heartbeatMs?: number;
	acceptanceTimeoutMs?: number;
}

export interface OwnerStartInfo {
	ownerId: string;
	socketPath: string;
	leaseEpoch: number;
}

export class RuntimeOwner {
	readonly ownerId: string;
	#root: string;
	#sessionId: string;
	#rpc: HarnessRpc;
	#subagentManager: SubagentManager | undefined;
	#ttlMs: number;
	#heartbeatMs: number;
	#acceptanceTimeoutMs: number;
	#server: ControlServer;
	#heartbeatTimer: NodeJS.Timeout | undefined;
	#leaseEpoch = 0;
	#cursor = 0;
	#unsubscribeFrames: (() => void) | undefined;

	constructor(opts: OwnerOptions) {
		this.ownerId = opts.ownerId ?? `owner-${randomUUID()}`;
		this.#root = opts.root;
		this.#sessionId = opts.sessionId;
		this.#rpc = opts.rpc;
		this.#ttlMs = opts.ttlMs ?? DEFAULT_TTL_MS;
		this.#heartbeatMs = opts.heartbeatMs ?? DEFAULT_HEARTBEAT_MS;
		this.#acceptanceTimeoutMs = opts.acceptanceTimeoutMs ?? DEFAULT_ACCEPTANCE_TIMEOUT_MS;
		this.#server = new ControlServer(sessionPaths(this.#root, this.#sessionId).controlSock, (req) =>
			this.#handle(req),
		);
	}

	async start(): Promise<OwnerStartInfo> {
		const paths = sessionPaths(this.#root, this.#sessionId);
		const existing = await readEvents(this.#root, this.#sessionId, 0);
		this.#cursor = existing.reduce(
			(max, event) => Math.max(max, typeof event.cursor === "number" ? event.cursor : 0),
			0,
		);
		const { lease } = await acquireLease(this.#root, this.#sessionId, {
			ownerId: this.ownerId,
			pid: process.pid,
			endpoint: { kind: "unix-socket", path: paths.controlSock },
			eventsPath: paths.events,
			ttlMs: this.#ttlMs,
		});
		this.#leaseEpoch = lease.leaseEpoch;
		await this.#server.listen();
		this.#unsubscribeFrames = this.#rpc.onEventFrame?.((frame) => {
			void this.#emit("rpc_event", { frameType: typeof frame.type === "string" ? frame.type : "unknown" });
		});
		await this.#emit("owner_started", { ownerId: this.ownerId, rpcPid: this.#rpc.pid?.() ?? null });
		this.#heartbeatTimer = setInterval(() => {
			void heartbeat(this.#root, this.#sessionId, this.ownerId, this.#ttlMs).catch(() => this.stop());
		}, this.#heartbeatMs);
		this.#heartbeatTimer.unref?.();
		await this.#initSubagentManager();
		return { ownerId: this.ownerId, socketPath: paths.controlSock, leaseEpoch: this.#leaseEpoch };
	}

	async #initSubagentManager(): Promise<void> {
		const factory = getSubagentManagerFactory();
		if (!factory) {
			await this.#emit("subagent_backend_unavailable", { reason: "no factory registered" }).catch(() => undefined);
			return;
		}
		try {
			const state = await this.#loadState();
			const result = factory({ cwd: state.handle.workspace });
			this.#subagentManager = result instanceof Promise ? await result : result;
		} catch (error) {
			await this.#emit("subagent_backend_unavailable", { reason: String(error) }).catch(() => undefined);
			this.#subagentManager = undefined;
		}
	}

	async #loadState(): Promise<SessionState> {
		const state = await readSessionState(this.#root, this.#sessionId);
		if (!state) throw new Error(`session_not_found:${this.#sessionId}`);
		return state;
	}

	async #emit(kind: string, evidence: Record<string, unknown>): Promise<void> {
		const lease = await readLease(this.#root, this.#sessionId);
		if (!lease || !canWriteEvents(lease, this.ownerId)) return;
		const state = await readSessionState(this.#root, this.#sessionId);
		const view = state
			? buildStateView(state, true)
			: {
					sessionId: this.#sessionId,
					lifecycle: "started" as const,
					harness: "pi" as const,
					ownerLive: true,
					blockers: [],
				};
		await appendEvent(this.#root, this.#sessionId, {
			eventId: randomUUID(),
			cursor: ++this.#cursor,
			createdAt: new Date().toISOString(),
			severity: "info",
			kind,
			state: view,
			evidence,
			nextAllowedActions: nextAllowedActions(view.lifecycle, true),
			writer: { ownerId: this.ownerId, leaseEpoch: this.#leaseEpoch },
		});
	}

	async #observation(state: SessionState): Promise<Observation> {
		let rpcState = null;
		try {
			rpcState = await this.#rpc.getState();
		} catch {}
		const rpcLive = this.#rpc.isLive?.() ?? rpcState !== null;
		const submitReason = submitUnavailableReason(
			state.lifecycle,
			true,
			rpcState && (rpcState.isStreaming || rpcState.steeringQueueDepth > 0 || rpcState.followupQueueDepth > 0)
				? "rpc-not-idle"
				: rpcLive
					? null
					: "rpc-not-live",
		);
		return {
			lifecycle: state.lifecycle,
			ownerLive: true,
			cwd: state.handle.workspace,
			branch: state.handle.branch,
			gitDelta: "unknown",
			lastActivityAt: this.#rpc.lastFrameAt?.() ?? state.updatedAt,
			observedSignals: [rpcState?.isStreaming ? "streaming" : "idle"],
			risk: "normal",
			readyForSubmit: submitReason === null,
			submitUnavailableReason: submitReason,
		};
	}

	async #handle(req: EndpointRequest): Promise<unknown> {
		if (req.verb === "ping") return { ok: true, ownerId: this.ownerId, leaseEpoch: this.#leaseEpoch };
		if (req.verb === "observe") {
			const state = await this.#loadState();
			const observation = await this.#observation(state);
			return buildResponse(
				state,
				true,
				{ observation, ownerRouted: true },
				true,
				observation.submitUnavailableReason,
			);
		}
		if (req.verb === "classify") return this.#classify(req.input);
		if (req.verb === "recover") return this.#recover(req.input);
		if (req.verb === "validate") return this.#validate(req.input);
		if (req.verb === "finalize") return this.#finalize(req.input);
		if (req.verb === "operate") return this.#operate(req.input);
		if (req.verb === "submit") return this.#submit(req.input);
		if (req.verb === "retire") return this.#retire();
		if (req.verb.startsWith("subagents.")) {
			const action = req.verb.slice("subagents.".length);
			return this.#handleSubagents(action, (req.input ?? {}) as Record<string, unknown>);
		}
		return { ok: false, error: `owner_unsupported_verb:${req.verb}` };
	}

	async #handleSubagents(action: string, input: Record<string, unknown>): Promise<unknown> {
		const manager = this.#subagentManager;
		if (!manager) return { ok: false, error: "no subagent manager: factory not registered or unavailable" };
		// Force storageSessionId to the owner session so records co-locate and clients can't choose a session.
		const storageSessionId = this.#sessionId;
		const id = typeof input.id === "string" ? input.id : undefined;
		switch (action) {
			case "spawn":
				return manager.spawn({ ...(input as Record<string, unknown>), storageSessionId } as never);
			case "await":
				return manager.waitFor(String(input.id), (input.options ?? {}) as never);
			case "steer":
				return manager.steer(
					String(input.id),
					String(input.message),
					(input.delivery === "followUp" ? "followUp" : "steer") as "steer" | "followUp",
					storageSessionId,
				);
			case "pause":
				return manager.pause(String(input.id), storageSessionId);
			case "resume":
				return manager.resume(String(input.id), String(input.message), {
					...(input.options ?? {}),
					storageSessionId,
				} as never);
			case "cancel":
				return manager.cancel(String(input.id), storageSessionId);
			case "read":
				return id ? manager.read(id, storageSessionId) : undefined;
			case "list":
				return manager.list(storageSessionId);
			case "status":
				return id
					? { ok: true, record: await manager.read(id, storageSessionId) }
					: { ok: true, records: await manager.list(storageSessionId) };
			default:
				return { ok: false, error: `owner_unsupported_subagent_verb:${action}` };
		}
	}

	async #classify(input: Record<string, unknown>): Promise<PrimitiveResponse> {
		const state = await this.#loadState();
		const receipts = await readRuntimeReceipts(this.#root, this.#sessionId);
		return classifyPrimitive({
			state,
			ownerLive: true,
			input,
			rpc: this.#rpc,
			receipts: receipts.rows,
			extraEvidence: { ownerRouted: true },
		});
	}

	async #recover(input: Record<string, unknown>): Promise<PrimitiveResponse> {
		const state = await this.#loadState();
		const receipts = await readRuntimeReceipts(this.#root, this.#sessionId);
		return recoverPrimitive({
			root: this.#root,
			state,
			ownerLive: true,
			input,
			rpc: this.#rpc,
			receipts: receipts.rows,
			writer: { ownerId: this.ownerId, leaseEpoch: this.#leaseEpoch },
		});
	}

	async #validate(input: Record<string, unknown>): Promise<PrimitiveResponse> {
		const state = await this.#loadState();
		return validatePrimitive({
			root: this.#root,
			state,
			ownerLive: true,
			input,
			writer: { ownerId: this.ownerId, leaseEpoch: this.#leaseEpoch },
		});
	}

	async #finalize(input: Record<string, unknown>): Promise<PrimitiveResponse> {
		const state = await this.#loadState();
		const receipts = await readRuntimeReceipts(this.#root, this.#sessionId);
		return finalizePrimitive({
			root: this.#root,
			state,
			ownerLive: true,
			input,
			receipts: receipts.rows,
			writer: { ownerId: this.ownerId, leaseEpoch: this.#leaseEpoch },
		});
	}

	async #operate(input: Record<string, unknown>): Promise<unknown> {
		const goal = typeof input.goal === "string" ? input.goal : "";
		const state = await this.#loadState();
		if (!goal) return buildResponse(state, true, { accepted: false, reason: "empty-goal" }, false, "empty-goal");
		const maxIterations = typeof input.maxIterations === "number" ? input.maxIterations : undefined;
		const acceptanceTimeoutMs = typeof input.acceptanceTimeoutMs === "number" ? input.acceptanceTimeoutMs : undefined;
		return operate({
			root: this.#root,
			sessionId: this.#sessionId,
			goal,
			ownerLive: true,
			writer: { ownerId: this.ownerId, leaseEpoch: this.#leaseEpoch },
			rpc: this.#rpc,
			// Owner is in-process and live; the vanished branch (which calls spawnOwner) is unreachable here.
			spawnOwner: async () => true,
			observe: async (sessionState) => {
				const receipts = await readRuntimeReceipts(this.#root, this.#sessionId);
				return buildClassificationInput({
					state: sessionState,
					ownerLive: true,
					rpc: this.#rpc,
					receipts: receipts.rows,
					input,
				});
			},
			maxIterations,
			acceptanceTimeoutMs,
			emit: async (kind, evidence) => {
				await this.#emit(kind, evidence);
			},
		});
	}

	async #submit(input: Record<string, unknown>): Promise<PrimitiveResponse> {
		const prompt = typeof input.prompt === "string" ? input.prompt : "";
		const state = await this.#loadState();
		if (!prompt)
			return buildResponse(state, true, { accepted: false, reason: "empty-prompt" }, false, "empty-prompt");
		const lifecycleGate = submitUnavailableReason(state.lifecycle, true);
		if (lifecycleGate)
			return buildResponse(state, true, { accepted: false, reason: lifecycleGate }, false, lifecycleGate);
		const result = await singleFlightAccept(this.#rpc, prompt, this.#acceptanceTimeoutMs);
		if (result.accepted) {
			const now = new Date().toISOString();
			const next: SessionState = {
				...state,
				lifecycle: "observing",
				updatedAt: now,
				handle: { ...state.handle, updatedAt: now },
			};
			await writeSessionState(this.#root, next);
			await this.#emit("prompt_accepted", { reason: result.reason, agentStartCursor: result.agentStartCursor });
			return buildResponse(next, true, { ...result, accepted: true });
		}
		await this.#emit("prompt_not_accepted", { reason: result.reason });
		return buildResponse(
			state,
			true,
			{ ...result, accepted: false },
			false,
			result.reason === "pre-state-not-idle" ? "rpc-not-idle" : null,
		);
	}

	async #retire(): Promise<PrimitiveResponse> {
		const state = await this.#loadState();
		const now = new Date().toISOString();
		const next: SessionState = {
			...state,
			lifecycle: "retired",
			updatedAt: now,
			handle: { ...state.handle, updatedAt: now },
		};
		await writeSessionState(this.#root, next);
		await this.#emit("owner_retired", {});
		queueMicrotask(() => void this.stop());
		return buildResponse(next, true, { retired: true });
	}

	async stop(): Promise<void> {
		this.#unsubscribeFrames?.();
		if (this.#heartbeatTimer) clearInterval(this.#heartbeatTimer);
		await this.#server.close().catch(() => undefined);
		await this.#rpc.close().catch(() => undefined);
		await this.#subagentManager?.dispose().catch(() => undefined);
		await releaseLease(this.#root, this.#sessionId, this.ownerId).catch(() => undefined);
	}
}

export interface ResolvedOwner {
	live: boolean;
	socketPath: string | null;
	lease: SessionLease | null;
}

export async function resolveOwner(root: string, sessionId: string): Promise<ResolvedOwner> {
	const lease = await readLease(root, sessionId);
	if (!lease) return { live: false, socketPath: null, lease: null };
	const status = classifyLeaseStatus(lease);
	const live = status === "live" || status === "expiredAlive" || status === "epermAlive";
	return { live, socketPath: lease.endpoint?.path ?? null, lease };
}
