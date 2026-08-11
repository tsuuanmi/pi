import { spawn } from "node:child_process";
import {
	assertDetachedInteractiveAllowed,
	gitOutput,
	inputString,
	output,
	sessionIdFromInput,
} from "#workflows/commands/workflow/command-utils";
import type { WorkflowCommandResult } from "#workflows/commands/workflow/index";
import { callEndpoint } from "#workflows/runtime/endpoint";
import type { GcContext } from "#workflows/runtime/gc";
import { collectGcReport, computeGcExitCode, gcPidProbe, HarnessLeasesGcStoreAdapter } from "#workflows/runtime/gc";
import { acquireLease, releaseLease } from "#workflows/runtime/lease";
import { buildResponse, submitUnavailableReason } from "#workflows/runtime/lifecycle";
import { mutateRuntimeSession } from "#workflows/runtime/mutation";
import {
	buildWorkspaceMarker,
	classify as classifySession,
	recover as recoverSession,
} from "#workflows/runtime/operations";
import { RuntimeOwner, resolveOwner } from "#workflows/runtime/owner";
import { PiRpc } from "#workflows/runtime/rpc";
import {
	canonicalWorkspacePath,
	defaultRepoName,
	readEvents,
	readSessionState,
	readWorkflowRuntimeReceipts,
	resolveHarnessRoot,
	sessionPaths,
} from "#workflows/runtime/storage";
import {
	type Observation,
	SESSION_SCHEMA_VERSION,
	type SessionHandle,
	type SessionState,
} from "#workflows/runtime/types";

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
		issueOrPr: inputString(input, "issueOrPr") ?? null,
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
	assertDetachedInteractiveAllowed(input, true);
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
	const ownerId = `workflow-bootstrap:${process.pid}`;
	const { lease } = await acquireLease(root, sessionId, {
		ownerId,
		pid: process.pid,
		ttlMs: 30_000,
		eventsPath: sessionPaths(root, sessionId).events,
	});
	const mutation = await (async () => {
		try {
			return await mutateRuntimeSession({
				root,
				sessionId,
				verb: "start",
				writer: lease.writer,
				ownerLive: true,
				nextState: state,
				events: [{ kind: "workflow_started", evidence: { sessionId, workspace } }],
				evidence: { handle, root },
			});
		} finally {
			await releaseLease(root, sessionId, ownerId);
		}
	})();
	const ownerPid = spawnDetachedOwner({ ...input, workspace, root, sessionId });
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

async function requireOwner(
	root: string,
	state: SessionState,
	verb: string,
	input: Record<string, unknown>,
): Promise<unknown> {
	const response = await routeToOwner(root, state, verb, input);
	if (response === undefined) throw new Error(`workflow owner is not running for session ${state.sessionId}`);
	return response;
}

function primitiveStatus(response: unknown): number {
	if (!response || typeof response !== "object" || Array.isArray(response)) return 1;
	return (response as { ok?: unknown }).ok === false ? 1 : 0;
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
	const ownerResponse = await routeToOwner(root, state, "observe", input);
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
	const ownerResponse = await routeToOwner(root, state, "submit", input);
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
	const owner = await resolveOwner(root, state.sessionId);
	const receipts = await readWorkflowRuntimeReceipts(root, state.sessionId);
	const response = await classifySession({ state, ownerLive: owner.live, input, receipts: receipts.rows });
	return { status: primitiveStatus(response), stdout: output(response, json), stderr: "" };
}

export async function recover(input: Record<string, unknown>, json: boolean): Promise<WorkflowCommandResult> {
	const { root, state } = await loadState(input);
	const currentOwner = await resolveOwner(root, state.sessionId);
	if (currentOwner.live) throw new Error(`workflow owner is still running for session ${state.sessionId}`);
	const ownerId = `workflow-recovery:${process.pid}`;
	const { lease } = await acquireLease(root, state.sessionId, {
		ownerId,
		pid: process.pid,
		ttlMs: 30_000,
		eventsPath: sessionPaths(root, state.sessionId).events,
	});
	let leaseHeld = true;
	const release = async (): Promise<void> => {
		if (!leaseHeld) return;
		await releaseLease(root, state.sessionId, ownerId);
		leaseHeld = false;
	};
	try {
		const receipts = await readWorkflowRuntimeReceipts(root, state.sessionId);
		const response = await recoverSession({
			root,
			state,
			ownerLive: true,
			input,
			receipts: receipts.rows,
			writer: lease.writer,
			spawnOwner: async () => {
				await release();
				spawnDetachedOwner({ ...input, root, workspace: state.handle.workspace, sessionId: state.sessionId });
				return waitForOwnerLive(root, state.sessionId);
			},
		});
		return { status: primitiveStatus(response), stdout: output(response, json), stderr: "" };
	} finally {
		await release();
	}
}

export async function validate(input: Record<string, unknown>, json: boolean): Promise<WorkflowCommandResult> {
	const { root, state } = await loadState(input);
	const response = await requireOwner(root, state, "validate", input);
	return { status: primitiveStatus(response), stdout: output(response, json), stderr: "" };
}

export async function finalize(input: Record<string, unknown>, json: boolean): Promise<WorkflowCommandResult> {
	const { root, state } = await loadState(input);
	const response = await requireOwner(root, state, "finalize", input);
	return { status: primitiveStatus(response), stdout: output(response, json), stderr: "" };
}

export async function operateCmd(input: Record<string, unknown>, json: boolean): Promise<WorkflowCommandResult> {
	const { root, state } = await loadState(input);
	const response = await requireOwner(root, state, "operate", input);
	return { status: primitiveStatus(response), stdout: output(response, json), stderr: "" };
}

export async function events(input: Record<string, unknown>, json: boolean): Promise<WorkflowCommandResult> {
	const { root, state } = await loadState(input);
	const after = typeof input.afterCursor === "number" ? input.afterCursor : 0;
	const rows = await readEvents(root, state.sessionId, after);
	return { status: 0, stdout: output(buildResponse(state, false, { events: rows }), json), stderr: "" };
}

export async function retire(input: Record<string, unknown>, json: boolean): Promise<WorkflowCommandResult> {
	const { root, state } = await loadState(input);
	const response = await requireOwner(root, state, "retire", input);
	return { status: primitiveStatus(response), stdout: output(response, json), stderr: "" };
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
