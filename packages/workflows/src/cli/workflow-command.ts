import { execFileSync, spawn } from "node:child_process";
import { callEndpoint } from "../harness/runtime/endpoint.ts";
import type { GcContext } from "../harness/runtime/gc.ts";
import {
	collectGcReport,
	computeGcExitCode,
	gcPidProbe,
	HarnessLeasesGcStoreAdapter,
} from "../harness/runtime/gc.ts";
import { mutateRuntimeSession } from "../harness/runtime/mutation.ts";
import { RuntimeOwner, resolveOwner } from "../harness/runtime/owner.ts";
import {
	buildClassificationInput,
	buildWorkspaceMarker,
	classifyPrimitive,
	finalizePrimitive,
	recoverPrimitive,
	validatePrimitive,
} from "../harness/runtime/primitives.ts";
import { type HarnessRpc, PiRpc } from "../harness/runtime/rpc.ts";
import { operate } from "../harness/runtime/runner.ts";
import { buildResponse, submitUnavailableReason } from "../harness/runtime/state.ts";
import {
	canonicalWorkspacePath,
	defaultRepoName,
	generateSessionId,
	readEvents,
	readRuntimeReceipts,
	readSessionState,
	removeSession,
	resolveHarnessRoot,
	sessionPaths,
	writeSessionState,
} from "../harness/runtime/storage.ts";
import {
	type Observation,
	SESSION_SCHEMA_VERSION,
	type SessionHandle,
	type SessionState,
} from "../harness/runtime/types.ts";
import { runStateCommand } from "./state-command.ts";

interface WorkflowCommandResult {
	status: number;
	stdout: string;
	stderr: string;
}

interface ParsedWorkflowCommand {
	verb: string;
	input?: string;
	json: boolean;
	help: boolean;
	prune: boolean;
	dryRun: boolean;
}

function usage(): string {
	return `Usage:
  pi workflow state <skill> read --json
  pi workflow start --input '{"workspace":".","sessionId":"optional","detach":true}' --json
  pi workflow submit --input '{"sessionId":"h-...","prompt":"work"}' --json
  pi workflow observe --input '{"sessionId":"h-..."}' --json
  pi workflow classify --input '{"sessionId":"h-..."}' --json
  pi workflow recover --input '{"sessionId":"h-..."}' --json
  pi workflow validate --input '{"sessionId":"h-...","checks":[{"name":"check","command":"npm run check"}]}' --json
  pi workflow finalize --input '{"sessionId":"h-..."}' --json
  pi workflow operate --input '{"sessionId":"h-...","goal":"...","maxIterations":10}' --json
  pi workflow gc [--prune] [--dry-run] --json
  pi workflow events --input '{"sessionId":"h-..."}' --json
  pi workflow retire --input '{"sessionId":"h-..."}' --json

State root: PI_HARNESS_STATE_ROOT or <workspace>/.pi/state/harness
`;
}

function parseWorkflowArgs(args: string[]): ParsedWorkflowCommand {
	const parsed: ParsedWorkflowCommand = { verb: "observe", json: false, help: false, prune: false, dryRun: false };
	let verbSet = false;
	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		if (arg === "--help" || arg === "-h") {
			parsed.help = true;
			continue;
		}
		if (arg === "--json") {
			parsed.json = true;
			continue;
		}
		if (arg === "--prune") {
			parsed.prune = true;
			continue;
		}
		if (arg === "--dry-run") {
			parsed.dryRun = true;
			continue;
		}
		if (arg === "--input") {
			const value = args[++i];
			if (value === undefined) throw new Error("--input requires a value");
			parsed.input = value;
			continue;
		}
		if (arg.startsWith("-")) throw new Error(`unknown workflow option: ${arg}`);
		if (!verbSet) {
			parsed.verb = arg;
			verbSet = true;
			continue;
		}
		throw new Error(`unknown workflow argument: ${arg}`);
	}
	return parsed;
}

function parseInput(raw: string | undefined): Record<string, unknown> {
	if (!raw?.trim()) return {};
	const parsed = JSON.parse(raw) as unknown;
	if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("input must be a JSON object");
	return parsed as Record<string, unknown>;
}

function gitOutput(workspace: string, args: string[]): string | null {
	try {
		return execFileSync("git", args, {
			cwd: workspace,
			encoding: "utf8",
			stdio: ["ignore", "pipe", "ignore"],
		}).trim();
	} catch {
		return null;
	}
}

function inputString(input: Record<string, unknown>, key: string): string | undefined {
	const value = input[key];
	return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function sessionIdFromInput(input: Record<string, unknown>): string {
	const sessionId = inputString(input, "sessionId") ?? inputString(input, "session");
	if (!sessionId) throw new Error("sessionId is required");
	return sessionId;
}

function output(value: unknown, json: boolean): string {
	return json ? `${JSON.stringify(value, null, 2)}\n` : `${JSON.stringify(value)}\n`;
}

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

async function start(input: Record<string, unknown>, json: boolean): Promise<WorkflowCommandResult> {
	const workspace = canonicalWorkspacePath(inputString(input, "workspace") ?? process.cwd());
	const root = resolveHarnessRoot({ root: inputString(input, "root"), cwd: workspace });
	const sessionId = inputString(input, "sessionId") ?? generateSessionId();
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

async function observe(input: Record<string, unknown>, json: boolean): Promise<WorkflowCommandResult> {
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

async function submit(input: Record<string, unknown>, json: boolean): Promise<WorkflowCommandResult> {
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

async function classify(input: Record<string, unknown>, json: boolean): Promise<WorkflowCommandResult> {
	const { root, state } = await loadState(input);
	const ownerResponse = await routeToOwner(root, state, "classify", input).catch(() => undefined);
	if (ownerResponse)
		return { status: primitiveStatus(ownerResponse), stdout: output(ownerResponse, json), stderr: "" };
	const receipts = await readRuntimeReceipts(root, state.sessionId);
	const response = await classifyPrimitive({ state, ownerLive: false, input, receipts: receipts.rows });
	return { status: primitiveStatus(response), stdout: output(response, json), stderr: "" };
}

async function recover(input: Record<string, unknown>, json: boolean): Promise<WorkflowCommandResult> {
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

async function validate(input: Record<string, unknown>, json: boolean): Promise<WorkflowCommandResult> {
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

async function finalize(input: Record<string, unknown>, json: boolean): Promise<WorkflowCommandResult> {
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

async function operateCmd(input: Record<string, unknown>, json: boolean): Promise<WorkflowCommandResult> {
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

async function events(input: Record<string, unknown>, json: boolean): Promise<WorkflowCommandResult> {
	const { root, state } = await loadState(input);
	const after = typeof input.afterCursor === "number" ? input.afterCursor : 0;
	const rows = await readEvents(root, state.sessionId, after);
	return { status: 0, stdout: output(buildResponse(state, false, { events: rows }), json), stderr: "" };
}

async function retire(input: Record<string, unknown>, json: boolean): Promise<WorkflowCommandResult> {
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

async function runOwner(input: Record<string, unknown>): Promise<WorkflowCommandResult> {
	const { root, state } = await loadState(input);
	const rpc = new PiRpc({ cwd: state.handle.workspace, sessionDir: sessionPaths(root, state.sessionId).piSessionDir });
	const owner = new RuntimeOwner({ root, sessionId: state.sessionId, rpc });
	await owner.start();
	return new Promise(() => undefined);
}

async function gc(args: {
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

async function dispatch(parsed: ParsedWorkflowCommand, cwd: string): Promise<WorkflowCommandResult> {
	if (parsed.help) return { status: 0, stdout: usage(), stderr: "" };
	if (parsed.verb !== "gc" && (parsed.prune || parsed.dryRun)) {
		throw new Error(`--prune/--dry-run are only supported for pi workflow gc, not ${parsed.verb}`);
	}
	const input = parseInput(parsed.input);
	if (parsed.verb === "start") return start(input, parsed.json);
	if (parsed.verb === "owner") return runOwner(input);
	if (parsed.verb === "submit") return submit(input, parsed.json);
	if (parsed.verb === "observe") return observe(input, parsed.json);
	if (parsed.verb === "classify") return classify(input, parsed.json);
	if (parsed.verb === "recover") return recover(input, parsed.json);
	if (parsed.verb === "validate") return validate(input, parsed.json);
	if (parsed.verb === "finalize") return finalize(input, parsed.json);
	if (parsed.verb === "operate") return operateCmd(input, parsed.json);
	if (parsed.verb === "gc") return gc({ prune: parsed.prune, dryRun: parsed.dryRun, json: parsed.json, input, cwd });
	if (parsed.verb === "events") return events(input, parsed.json);
	if (parsed.verb === "retire") return retire(input, parsed.json);
	throw new Error(`unsupported pi workflow verb: ${parsed.verb}`);
}

export async function runWorkflowCommand(args: string[], cwd = process.cwd()): Promise<WorkflowCommandResult> {
	try {
		if (args[0] === "state") return await runStateCommand(args.slice(1), cwd);
		return await dispatch(parseWorkflowArgs(args), cwd);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		return { status: 1, stdout: "", stderr: `Error: ${message}\n` };
	}
}

export async function handleWorkflowCommand(args: string[]): Promise<boolean> {
	if (args[0] !== "workflow") return false;
	const result = await runWorkflowCommand(args.slice(1));
	if (result.stdout) process.stdout.write(result.stdout);
	if (result.stderr) process.stderr.write(result.stderr);
	process.exitCode = result.status;
	return true;
}
