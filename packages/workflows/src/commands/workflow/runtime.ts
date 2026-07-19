import { spawn } from "node:child_process";
import type { WorkflowCommandResult } from "#workflows/commands/workflow/types";
import {
	assertDetachedInteractiveAllowed,
	gitOutput,
	inputString,
	output,
	sessionIdFromInput,
} from "#workflows/commands/workflow/utils";
import { callEndpoint } from "#workflows/harness/runtime/endpoint";
import type { GcContext } from "#workflows/harness/runtime/gc";
import {
	collectGcReport,
	computeGcExitCode,
	gcPidProbe,
	HarnessLeasesGcStoreAdapter,
} from "#workflows/harness/runtime/gc";
import { mutateRuntimeSession } from "#workflows/harness/runtime/mutation";
import { RuntimeOwner, resolveOwner } from "#workflows/harness/runtime/owner";
import {
	buildClassificationInput,
	buildWorkspaceMarker,
	classifyPrimitive,
	finalizePrimitive,
	recoverPrimitive,
	validatePrimitive,
} from "#workflows/harness/runtime/primitives";
import { type HarnessRpc, PiRpc } from "#workflows/harness/runtime/rpc";
import { operate } from "#workflows/harness/runtime/runner";
import { buildResponse, submitUnavailableReason } from "#workflows/harness/runtime/state";
import {
	canonicalWorkspacePath,
	defaultRepoName,
	readEvents,
	readRuntimeReceipts,
	readSessionState,
	removeSession,
	resolveHarnessRoot,
	sessionPaths,
	writeSessionState,
} from "#workflows/harness/runtime/storage";
import {
	type Observation,
	SESSION_SCHEMA_VERSION,
	type SessionHandle,
	type SessionState,
} from "#workflows/harness/runtime/types";

function buildHandle(input: Record<string, unknown>, root: string, sessionId: string, now: string): SessionHandle {
	const workspace = canonicalWorkspacePath(inputString(input, "workspace") ?? process.cwd());
	const paths = sessionPaths(root, sessionId);
	const branch = inputString(input, "branch") ?? gitOutput(workspace, ["rev-parse", "--abbrev-ref", "HEAD"]);
	const headRev = gitOutput(workspace, ["rev-parse", "HEAD"]);
	const base = inputString(input, "base") ?? (headRev && headRev !== "HEAD" ? headRev : null);
	return {
		sessionId,
		harness: "pi",
		mode: input.mode === "review" ? "review" : "implement",
		repo: inputString(input, "repo") ?? defaultRepoName(workspace),
		workspace,
		branch: branch && branch !== "HEAD" ? branch : null,
		base,
		issueOrPr: inputString(input, "issueOrPr") ?? inputString(input, "pr") ?? inputString(input, "issue") ?? null,
		processHandle: { kind: "runtime-owner", ownerId: null, pid: null },
		rpcHandle: { kind: "rpc-subprocess", pid: null, sessionDir: paths.piSessionDir },
		ownerHandle: { leasePath: paths.lease, endpoint: null, heartbeatAt: null },
		routerHandle: { kind: "default-in-owner", policy: "workflow-runtime", eventsPath: paths.events },
		viewportHandle: { kind: "event-monitor", tmuxSessionName: null, viewOnly: true },
		startedAt: now,
		updatedAt: now,
	};
}

function spawnDetachedOwner(input: Record<string, unknown>): number | null {
	const entry = process.argv[1];
	if (!entry) throw new Error("cannot determine Pi CLI entrypoint for detached workflow owner");
	const child = spawn(
		process.execPath,
		[...process.execArgv, entry, "workflow", "owner", "--input", JSON.stringify(input)],
		{
			cwd: inputString(input, "workspace") ?? process.cwd(),
			env: process.env,
			detached: true,
			stdio: "ignore",
		},
	);
	child.unref();
	return child.pid ?? null;
}

export async function start(input: Record<string, unknown>, json: boolean): Promise<WorkflowCommandResult> {
	assertDetachedInteractiveAllowed(input, input.detach === true);
	const workspace = canonicalWorkspacePath(inputString(input, "workspace") ?? process.cwd());
	const root = resolveHarnessRoot({ root: inputString(input, "root"), cwd: workspace });
	const sessionId = sessionIdFromInput(input);
	const now = new Date().toISOString();
	const handle = buildHandle(input, root, sessionId, now);
	const state: SessionState = {
		schemaVersion: SESSION_SCHEMA_VERSION,
		sessionId,
		lifecycle: "started",
		harness: "pi",
		handle,
		retries: {},
		blockers: [],
		createdAt: now,
		updatedAt: now,
	};
	const mutation = await mutateRuntimeSession({
		root,
		sessionId,
		verb: "start",
		writer: { ownerId: "workflow-cli", leaseEpoch: 0 },
		nextState: state,
		events: [{ kind: "workflow_started", evidence: { sessionId, workspace } }],
		evidence: { handle, root },
	});
	const ownerPid = input.detach === true ? spawnDetachedOwner({ ...input, workspace, root, sessionId }) : null;
	return {
		status: 0,
		stdout: output(buildResponse(state, false, { handle, root, ownerPid, receipt: mutation.receipt }), json),
		stderr: "",
	};
}

function observeState(state: SessionState): Observation {
	const marker = buildWorkspaceMarker(state.handle.workspace, state.handle.base);
	const ownerLive = false;
	const submitReason = submitUnavailableReason(state.lifecycle, ownerLive);
	return {
		lifecycle: state.lifecycle,
		ownerLive,
		cwd: state.handle.workspace,
		branch: state.handle.branch,
		gitDelta: marker.gitDelta,
		lastActivityAt: state.updatedAt,
		observedSignals: ["SessionStart"],
		risk:
			marker.risk === "deleted"
				? "deleted-worktree"
				: !ownerLive && marker.gitDelta === "dirty"
					? "vanished-dirty"
					: "normal",
		readyForSubmit: submitReason === null,
		submitUnavailableReason: submitReason,
	};
}

async function loadState(input: Record<string, unknown>): Promise<{ root: string; state: SessionState }> {
	const sessionId = sessionIdFromInput(input);
	const root = resolveHarnessRoot({
		root: inputString(input, "root"),
		cwd: inputString(input, "workspace") ?? process.cwd(),
	});
	const state = await readSessionState(root, sessionId);
	if (!state) throw new Error(`session_not_found:${sessionId}`);
	return { root, state };
}

async function routeToOwner(
	root: string,
	state: SessionState,
	verb: string,
	input: Record<string, unknown>,
): Promise<unknown | undefined> {
	const owner = await resolveOwner(root, state.sessionId);
	if (!owner.live || !owner.socketPath) return undefined;
	return callEndpoint(owner.socketPath, { verb, input });
}

function primitiveStatus(response: unknown): number {
	if (!response || typeof response !== "object" || Array.isArray(response)) return 1;
	return (response as { ok?: unknown }).ok === false ? 1 : 0;
}

class NoopRpc implements HarnessRpc {
	async getState() {
		return { isStreaming: false, steeringQueueDepth: 0, followupQueueDepth: 0 };
	}
	async sendPrompt(): Promise<{ commandId: string; ack: boolean }> {
		return { commandId: "noop", ack: false };
	}
	eventCursor(): number {
		return 0;
	}
	async waitForAgentStart(): Promise<{ cursor: number } | null> {
		return null;
	}
	async close(): Promise<void> {}
	isLive(): boolean {
		return false;
	}
}

async function waitForOwnerLive(root: string, sessionId: string, timeoutMs = 2_000): Promise<boolean> {
	const started = Date.now();
	while (Date.now() - started < timeoutMs) {
		const owner = await resolveOwner(root, sessionId);
		if (owner.live && owner.socketPath) return true;
		await new Promise((resolve) => setTimeout(resolve, 50));
	}
	return false;
}

export async function observe(input: Record<string, unknown>, json: boolean): Promise<WorkflowCommandResult> {
	const { root, state } = await loadState(input);
	const ownerResponse = await routeToOwner(root, state, "observe", input).catch(() => undefined);
	if (ownerResponse) return { status: 0, stdout: output(ownerResponse, json), stderr: "" };
	const observation = observeState(state);
	return {
		status: 0,
		stdout: output(
			buildResponse(state, observation.ownerLive, { observation }, true, observation.submitUnavailableReason),
			json,
		),
		stderr: "",
	};
}

export async function submit(input: Record<string, unknown>, json: boolean): Promise<WorkflowCommandResult> {
	const { root, state } = await loadState(input);
	const ownerResponse = await routeToOwner(root, state, "submit", input).catch(() => undefined);
	if (ownerResponse)
		return { status: primitiveStatus(ownerResponse), stdout: output(ownerResponse, json), stderr: "" };
	const reason = "owner-not-live";
	return {
		status: 1,
		stdout: output(buildResponse(state, false, { accepted: false, reason }, false, reason), json),
		stderr: "",
	};
}

export async function classify(input: Record<string, unknown>, json: boolean): Promise<WorkflowCommandResult> {
	const { root, state } = await loadState(input);
	const ownerResponse = await routeToOwner(root, state, "classify", input).catch(() => undefined);
	if (ownerResponse)
		return { status: primitiveStatus(ownerResponse), stdout: output(ownerResponse, json), stderr: "" };
	const receipts = await readRuntimeReceipts(root, state.sessionId);
	const response = await classifyPrimitive({ state, ownerLive: false, input, receipts: receipts.rows });
	return { status: primitiveStatus(response), stdout: output(response, json), stderr: "" };
}

export async function recover(input: Record<string, unknown>, json: boolean): Promise<WorkflowCommandResult> {
	const { root, state } = await loadState(input);
	const ownerResponse = await routeToOwner(root, state, "recover", input).catch(() => undefined);
	if (ownerResponse)
		return { status: primitiveStatus(ownerResponse), stdout: output(ownerResponse, json), stderr: "" };
	const receipts = await readRuntimeReceipts(root, state.sessionId);
	const response = await recoverPrimitive({
		root,
		state,
		ownerLive: false,
		input,
		receipts: receipts.rows,
		writer: { ownerId: "workflow-cli", leaseEpoch: 0 },
		spawnOwner: async () => {
			spawnDetachedOwner({ ...input, root, workspace: state.handle.workspace, sessionId: state.sessionId });
			return waitForOwnerLive(root, state.sessionId);
		},
	});
	return { status: primitiveStatus(response), stdout: output(response, json), stderr: "" };
}

export async function validate(input: Record<string, unknown>, json: boolean): Promise<WorkflowCommandResult> {
	const { root, state } = await loadState(input);
	const ownerResponse = await routeToOwner(root, state, "validate", input).catch(() => undefined);
	if (ownerResponse)
		return { status: primitiveStatus(ownerResponse), stdout: output(ownerResponse, json), stderr: "" };
	const response = await validatePrimitive({
		root,
		state,
		ownerLive: false,
		input,
		writer: { ownerId: "workflow-cli", leaseEpoch: 0 },
	});
	return { status: primitiveStatus(response), stdout: output(response, json), stderr: "" };
}

export async function finalize(input: Record<string, unknown>, json: boolean): Promise<WorkflowCommandResult> {
	const { root, state } = await loadState(input);
	const ownerResponse = await routeToOwner(root, state, "finalize", input).catch(() => undefined);
	if (ownerResponse)
		return { status: primitiveStatus(ownerResponse), stdout: output(ownerResponse, json), stderr: "" };
	const receipts = await readRuntimeReceipts(root, state.sessionId);
	const response = await finalizePrimitive({
		root,
		state,
		ownerLive: false,
		input,
		receipts: receipts.rows,
		writer: { ownerId: "workflow-cli", leaseEpoch: 0 },
	});
	return { status: primitiveStatus(response), stdout: output(response, json), stderr: "" };
}

export async function operateCmd(input: Record<string, unknown>, json: boolean): Promise<WorkflowCommandResult> {
	const { root, state } = await loadState(input);
	const ownerResponse = await routeToOwner(root, state, "operate", input).catch(() => undefined);
	if (ownerResponse)
		return { status: primitiveStatus(ownerResponse), stdout: output(ownerResponse, json), stderr: "" };
	const goal = inputString(input, "goal");
	if (!goal)
		return {
			status: 1,
			stdout: output(
				buildResponse(state, false, { accepted: false, reason: "empty-goal" }, false, "empty-goal"),
				json,
			),
			stderr: "",
		};
	const maxIterations = typeof input.maxIterations === "number" ? input.maxIterations : undefined;
	const acceptanceTimeoutMs = typeof input.acceptanceTimeoutMs === "number" ? input.acceptanceTimeoutMs : undefined;
	const result = await operate({
		root,
		sessionId: state.sessionId,
		goal,
		ownerLive: false,
		writer: { ownerId: "workflow-cli", leaseEpoch: 0 },
		rpc: new NoopRpc(),
		spawnOwner: async () => {
			const owner = await resolveOwner(root, state.sessionId);
			if (owner.live) return true;
			spawnDetachedOwner({ ...input, root, workspace: state.handle.workspace, sessionId: state.sessionId });
			return waitForOwnerLive(root, state.sessionId);
		},
		observe: async (sessionState) => {
			const owner = await resolveOwner(root, sessionState.sessionId);
			const receipts = await readRuntimeReceipts(root, sessionState.sessionId);
			return buildClassificationInput({
				state: sessionState,
				ownerLive: owner.live,
				receipts: receipts.rows,
				input,
			});
		},
		maxIterations,
		acceptanceTimeoutMs,
	});
	return { status: result.completed ? 0 : 1, stdout: output(result, json), stderr: "" };
}

export async function events(input: Record<string, unknown>, json: boolean): Promise<WorkflowCommandResult> {
	const { root, state } = await loadState(input);
	const after = typeof input.afterCursor === "number" ? input.afterCursor : 0;
	const rows = await readEvents(root, state.sessionId, after);
	return { status: 0, stdout: output(buildResponse(state, false, { events: rows }), json), stderr: "" };
}

export async function retire(input: Record<string, unknown>, json: boolean): Promise<WorkflowCommandResult> {
	const { root, state } = await loadState(input);
	const ownerResponse = await routeToOwner(root, state, "retire", input).catch(() => undefined);
	if (ownerResponse) return { status: 0, stdout: output(ownerResponse, json), stderr: "" };
	const now = new Date().toISOString();
	const next: SessionState = {
		...state,
		lifecycle: "retired",
		updatedAt: now,
		handle: { ...state.handle, updatedAt: now },
	};
	await writeSessionState(root, next);
	if (input.remove === true) await removeSession(root, next.sessionId);
	return {
		status: 0,
		stdout: output(buildResponse(next, false, { retired: true, removed: input.remove === true }), json),
		stderr: "",
	};
}

export async function runOwner(input: Record<string, unknown>): Promise<WorkflowCommandResult> {
	const { root, state } = await loadState(input);
	const rpc = new PiRpc({ cwd: state.handle.workspace, sessionDir: sessionPaths(root, state.sessionId).piSessionDir });
	const owner = new RuntimeOwner({ root, sessionId: state.sessionId, rpc });
	await owner.start();
	return new Promise(() => undefined);
}

export async function gc(args: {
	prune: boolean;
	dryRun: boolean;
	json: boolean;
	input?: Record<string, unknown>;
	cwd: string;
}): Promise<WorkflowCommandResult> {
	const input = args.input ?? {};
	const root = resolveHarnessRoot({
		root: inputString(input, "root"),
		cwd: inputString(input, "workspace") ?? args.cwd,
	});
	const prune = args.prune && !args.dryRun;
	const ctx: GcContext = { roots: [root], probe: gcPidProbe, prune, dryRun: !prune };
	const report = await collectGcReport([HarnessLeasesGcStoreAdapter], ctx);
	return { status: computeGcExitCode(report), stdout: output(report, args.json), stderr: "" };
}
