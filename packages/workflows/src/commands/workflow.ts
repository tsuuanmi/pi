import { execFileSync, spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import "../harness/deep-interview/deep-interview-transitions.ts";
import {
	appendOrMergeDeepInterviewRound,
	enrichDeepInterviewRoundScoring,
	finalizeDeepInterviewSpecState,
	planDeepInterviewQuestion,
	readDeepInterviewStateCompact,
	restateGoalGate,
	runClosureCheckForSession,
} from "../harness/deep-interview/deep-interview-runtime.ts";
import type {
	DeepInterviewAdvisoryMetadata,
	DeepInterviewRoundRecord,
} from "../harness/deep-interview/deep-interview-state.ts";
import { recordRalplanExplorerGateArtifact } from "../harness/ralplan/ralplan-gates.ts";
import type { RalplanApprovalTarget } from "../harness/ralplan/ralplan-runtime.ts";
import {
	approveRalplanPlan,
	doctorRalplan,
	readRalplanCompactStatus,
	readRalplanStatus,
	writeRalplanArtifact,
} from "../harness/ralplan/ralplan-runtime.ts";
import { handoffWorkflow } from "../harness/shared/orchestration/handoff.ts";
import { assertDeepInterviewHandoff } from "../harness/shared/orchestration/workflow-tool-utils.ts";
import type { RalplanStage } from "../harness/shared/session/paths.ts";
import { deepInterviewIndexPath, deepInterviewSpecPath } from "../harness/shared/session/session-layout.ts";
import { assertSafePathComponent } from "../harness/shared/state/state-schema.ts";
import { appendJsonl, readFileOrLiteral, writeTextArtifact } from "../harness/shared/state/state-writer.ts";
import { defaultWorkflowId } from "../harness/shared/state/workflow-id.ts";
import { activeRalplanRunId } from "../harness/shared/state/workflow-state.ts";
import {
	completeTeam,
	createTeamTask,
	readTeamCompact,
	readTeamSnapshot,
	recordTeamCompletionGateArtifact,
	recordTeamReviewGateArtifact,
	sendTeamMessage,
	startTeam,
	transitionTeamTask,
} from "../harness/team/team-runtime.ts";
import { ultragoalGuard } from "../harness/ultragoal/ultragoal-guard.ts";
import type { UltragoalGoalMode } from "../harness/ultragoal/ultragoal-receipt.ts";
import type { UltragoalBlockerClassification } from "../harness/ultragoal/ultragoal-runtime.ts";
import {
	checkpointUltragoalGoal,
	createUltragoalPlan,
	getUltragoalStatus,
	readUltragoalCompact,
	recordUltragoalBlockerClassification,
	recordUltragoalReviewBlockers,
	startNextUltragoalGoal,
} from "../harness/ultragoal/ultragoal-runtime.ts";
import "../harness/ralplan/ralplan-transitions.ts";
import "../harness/team/team-transitions.ts";
import "../harness/ultragoal/ultragoal-transitions.ts";
import { callEndpoint } from "../harness/runtime/endpoint.ts";
import type { GcContext } from "../harness/runtime/gc.ts";
import { collectGcReport, computeGcExitCode, gcPidProbe, HarnessLeasesGcStoreAdapter } from "../harness/runtime/gc.ts";
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
import { isBlockingQuestionPhaseForSkill } from "../harness/shared/registry/skill-registry.ts";
import type { WorkflowSkill } from "../harness/shared/session/paths.ts";
import { runStateCommand } from "./state-command.ts";

interface WorkflowCommandResult {
	status: number;
	stdout: string;
	stderr: string;
}

const SKILL_VERBS = new Set(["deep-interview", "ralplan", "team", "ultragoal"]);

interface ParsedWorkflowCommand {
	verb: string;
	subverb?: string;
	input?: string;
	inputFile?: string;
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
  pi workflow subagents <spawn|status|await|steer|pause|resume|cancel> --input '{"sessionId":"h-..."}' --json
  pi workflow gc [--prune] [--dry-run] --json
  pi workflow events --input '{"sessionId":"h-..."}' --json
  pi workflow retire --input '{"sessionId":"h-..."}' --json
  pi workflow <deep-interview|ralplan|team|ultragoal> <action> --input '{...}' --json
  pi workflow <deep-interview|ralplan|team|ultragoal> <action> --input-file ./payload.json --json

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
			if (parsed.inputFile !== undefined) throw new Error("--input and --input-file cannot be used together");
			parsed.input = value;
			continue;
		}
		if (arg === "--input-file") {
			const value = args[++i];
			if (value === undefined) throw new Error("--input-file requires a value");
			if (parsed.input !== undefined) throw new Error("--input and --input-file cannot be used together");
			parsed.inputFile = value;
			continue;
		}
		if (arg.startsWith("-")) throw new Error(`unknown workflow option: ${arg}`);
		if (!verbSet) {
			parsed.verb = arg;
			verbSet = true;
			continue;
		}
		if (parsed.verb === "subagents" && parsed.subverb === undefined) {
			parsed.subverb = arg;
			continue;
		}
		if (SKILL_VERBS.has(parsed.verb) && parsed.subverb === undefined) {
			parsed.subverb = arg;
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

async function parseWorkflowInput(parsed: ParsedWorkflowCommand, cwd: string): Promise<Record<string, unknown>> {
	if (parsed.inputFile === undefined) return parseInput(parsed.input);
	const filePath = isAbsolute(parsed.inputFile) ? parsed.inputFile : resolve(cwd, parsed.inputFile);
	const raw = await readFile(filePath, "utf8");
	return parseInput(raw);
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

function requiredString(input: Record<string, unknown>, key: string): string {
	const value = inputString(input, key);
	if (value === undefined) throw new Error(`${key} is required`);
	return value;
}

function optionalNumber(input: Record<string, unknown>, key: string): number | undefined {
	const value = input[key];
	return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function requiredNumber(input: Record<string, unknown>, key: string): number {
	const value = optionalNumber(input, key);
	if (value === undefined) throw new Error(`${key} must be a finite number`);
	return value;
}

function optionalStringArray(input: Record<string, unknown>, key: string): string[] | undefined {
	const value = input[key];
	if (!Array.isArray(value)) return undefined;
	return value.filter((item): item is string => typeof item === "string");
}

function requiredObject(input: Record<string, unknown>, key: string): Record<string, unknown> {
	const value = input[key];
	if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${key} must be an object`);
	return value as Record<string, unknown>;
}

function inputWorkflowSkill(input: Record<string, unknown>): WorkflowSkill | undefined {
	const skill = inputString(input, "skill");
	if (skill === "deep-interview" || skill === "ralplan" || skill === "team" || skill === "ultragoal") return skill;
	return undefined;
}

function assertDetachedInteractiveAllowed(input: Record<string, unknown>, detachRequested: boolean): void {
	if (!detachRequested) return;
	const skill = inputWorkflowSkill(input);
	if (!skill) return;
	const phase = inputString(input, "phase") ?? inputString(input, "current_phase") ?? inputString(input, "status");
	if (!isBlockingQuestionPhaseForSkill(skill, phase)) return;
	throw new Error(
		`detached workflow refused: skill ${skill} is interactive and phase ${phase} requires a blocking user question; run attached or clear the blocking phase`,
	);
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

async function deepInterviewVerb(
	action: string | undefined,
	input: Record<string, unknown>,
	json: boolean,
	cwd: string,
): Promise<WorkflowCommandResult> {
	const sessionId = sessionIdFromInput(input);
	const valid = new Set([
		"plan-question",
		"record-answer",
		"record-scoring",
		"read-compact",
		"closure-check",
		"restate-goal",
		"write-spec",
	]);
	if (!action || !valid.has(action))
		throw new Error(`unsupported pi workflow deep-interview verb: ${action ?? "(none)"}`);
	let body: unknown;
	switch (action) {
		case "plan-question": {
			body = await planDeepInterviewQuestion(
				cwd,
				{
					round: requiredNumber(input, "round"),
					questionId: inputString(input, "questionId"),
					questionText: requiredString(input, "questionText"),
					component: inputString(input, "component"),
					dimension: inputString(input, "dimension"),
					ambiguity: optionalNumber(input, "ambiguity"),
					rationale: inputString(input, "rationale"),
				},
				sessionId,
			);
			break;
		}
		case "record-answer": {
			body = await appendOrMergeDeepInterviewRound(
				cwd,
				{
					interviewId: inputString(input, "interviewId"),
					round: optionalNumber(input, "round"),
					round_id: inputString(input, "round_id"),
					questionId: inputString(input, "questionId"),
					questionText: inputString(input, "questionText"),
					component: inputString(input, "component"),
					dimension: inputString(input, "dimension"),
					ambiguity: optionalNumber(input, "ambiguity"),
					selectedOptions: optionalStringArray(input, "selectedOptions"),
					customInput: inputString(input, "customInput"),
					topology: input.topology,
				},
				sessionId,
			);
			break;
		}
		case "record-scoring": {
			body = await enrichDeepInterviewRoundScoring(
				cwd,
				{
					interviewId: inputString(input, "interviewId"),
					round: requiredNumber(input, "round"),
					round_id: inputString(input, "round_id"),
					questionId: inputString(input, "questionId"),
					scores: requiredObject(input, "scores") as Record<string, number>,
					ambiguity: requiredNumber(input, "ambiguity"),
					triggers: (input.triggers as DeepInterviewRoundRecord["triggers"]) ?? [],
					metadata: input.metadata as DeepInterviewAdvisoryMetadata | undefined,
				},
				sessionId,
			);
			break;
		}
		case "read-compact": {
			body = await readDeepInterviewStateCompact(cwd, sessionId, optionalNumber(input, "lastN"));
			break;
		}
		case "closure-check": {
			body = await runClosureCheckForSession(cwd, sessionId);
			break;
		}
		case "restate-goal": {
			body = await restateGoalGate(
				cwd,
				{
					restatedGoal: requiredString(input, "restatedGoal"),
					confirm: requiredString(input, "confirm") as "Yes" | "Adjust" | "Missing",
					adjustment: inputString(input, "adjustment"),
				},
				sessionId,
			);
			break;
		}
		case "write-spec": {
			const slug = inputString(input, "slug")?.trim() || defaultWorkflowId("spec");
			assertSafePathComponent(slug, "slug");
			const handoff = inputString(input, "handoff");
			if (handoff) assertDeepInterviewHandoff(handoff);
			const content = await readFileOrLiteral(requiredString(input, "spec"), cwd);
			const specPath = deepInterviewSpecPath(cwd, slug, sessionId);
			const result = await writeTextArtifact(specPath, content, { cwd });
			await appendJsonl(
				deepInterviewIndexPath(cwd, sessionId),
				{
					slug,
					path: result.path,
					sha256: result.sha256,
					created_at: result.createdAt,
				},
				{ cwd },
			);
			const handoffTarget = handoff as "ralplan" | "ultragoal" | "team" | undefined;
			if (handoffTarget === "ralplan" || handoffTarget === "team" || handoffTarget === "ultragoal") {
				await finalizeDeepInterviewSpecState(
					cwd,
					{ slug, path: result.path, sha256: result.sha256, handoff: handoffTarget },
					sessionId,
				);
				const calleePatch =
					handoffTarget === "ralplan"
						? {
								run_id: (await activeRalplanRunId(cwd, sessionId)) ?? defaultWorkflowId("ralplan"),
								input: result.path,
							}
						: { input: result.path };
				await handoffWorkflow({
					cwd,
					caller: { skill: "deep-interview", patch: {} },
					callee: { skill: handoffTarget, patch: calleePatch },
					command: "pi deep-interview write-spec",
					sessionId,
				});
			} else {
				await finalizeDeepInterviewSpecState(
					cwd,
					{ slug, path: result.path, sha256: result.sha256, handoff: handoff ?? "stop" },
					sessionId,
				);
			}
			body = { slug, path: result.path, sha256: result.sha256, handoff: handoffTarget };
			break;
		}
	}
	return { status: 0, stdout: output({ ok: true, body }, json), stderr: "" };
}

async function ralplanVerb(
	action: string | undefined,
	input: Record<string, unknown>,
	json: boolean,
	cwd: string,
): Promise<WorkflowCommandResult> {
	const sessionId = sessionIdFromInput(input);
	const valid = new Set([
		"record-explorer-gate",
		"run-agent",
		"write-artifact",
		"status",
		"read-compact",
		"doctor",
		"approve-plan",
	]);
	if (!action || !valid.has(action)) throw new Error(`unsupported pi workflow ralplan verb: ${action ?? "(none)"}`);
	let body: unknown;
	switch (action) {
		case "record-explorer-gate": {
			body = await recordRalplanExplorerGateArtifact(
				cwd,
				{
					runId: inputString(input, "runId"),
					contextMap: requiredObject(input, "contextMap"),
					recordedBy: inputString(input, "recordedBy"),
				},
				sessionId,
			);
			break;
		}
		case "run-agent": {
			throw new Error(
				"pi workflow ralplan run-agent is removed; use the ralplan_run_agent model-visible tool to spawn a ralplan role agent",
			);
		}
		case "write-artifact": {
			body = await writeRalplanArtifact(
				cwd,
				{
					runId: inputString(input, "runId"),
					stage: requiredString(input, "stage") as RalplanStage,
					stageN: requiredNumber(input, "stageN"),
					artifact: requiredString(input, "artifact"),
					plannerSubagentId: inputString(input, "plannerSubagentId"),
					plannerResumable: input.plannerResumable === true,
				},
				sessionId,
			);
			break;
		}
		case "status": {
			body = await readRalplanStatus(cwd, sessionId, inputString(input, "runId"));
			break;
		}
		case "read-compact": {
			body = await readRalplanCompactStatus(cwd, sessionId, inputString(input, "runId"));
			break;
		}
		case "doctor": {
			body = await doctorRalplan(cwd, sessionId, inputString(input, "runId"));
			break;
		}
		case "approve-plan": {
			body = await approveRalplanPlan(cwd, {
				runId: inputString(input, "runId"),
				target: inputString(input, "target") as RalplanApprovalTarget | undefined,
				approved: input.approved !== false,
				note: inputString(input, "note"),
				overrideCriticVerdict: input.overrideCriticVerdict === true,
				sessionId,
			});
			break;
		}
	}
	return { status: 0, stdout: output({ ok: true, body }, json), stderr: "" };
}

async function teamVerb(
	action: string | undefined,
	input: Record<string, unknown>,
	json: boolean,
	cwd: string,
): Promise<WorkflowCommandResult> {
	const sessionId = sessionIdFromInput(input);
	const valid = new Set([
		"start",
		"snapshot",
		"read-compact",
		"create-task",
		"transition-task",
		"send-message",
		"record-review-gate",
		"record-completion-gate",
		"complete",
		"spawn-task-agent",
	]);
	if (!action || !valid.has(action)) throw new Error(`unsupported pi workflow team verb: ${action ?? "(none)"}`);
	let body: unknown;
	switch (action) {
		case "start": {
			body = await startTeam(
				cwd,
				{
					task: requiredString(input, "task"),
					teamId: inputString(input, "teamId"),
					workers: (input.workers as { id?: string; name?: string; role?: string }[]) ?? undefined,
				},
				sessionId,
			);
			break;
		}
		case "snapshot": {
			body = await readTeamSnapshot(cwd, sessionId, inputString(input, "teamId"));
			break;
		}
		case "read-compact": {
			body = await readTeamCompact(cwd, sessionId, inputString(input, "teamId"));
			break;
		}
		case "create-task": {
			body = await createTeamTask(
				cwd,
				{
					teamId: inputString(input, "teamId"),
					id: inputString(input, "id"),
					title: requiredString(input, "title"),
					description: requiredString(input, "description"),
					owner: inputString(input, "owner"),
					dependsOn: (input.dependsOn as string[]) ?? undefined,
				},
				sessionId,
			);
			break;
		}
		case "transition-task": {
			body = await transitionTeamTask(
				cwd,
				{
					teamId: inputString(input, "teamId"),
					taskId: requiredString(input, "taskId"),
					status: requiredString(input, "status"),
					workerId: inputString(input, "workerId"),
					evidence: input.evidence as Record<string, unknown> as never,
				},
				sessionId,
			);
			break;
		}
		case "send-message": {
			body = await sendTeamMessage(
				cwd,
				{
					teamId: inputString(input, "teamId"),
					from: requiredString(input, "from"),
					to: requiredString(input, "to"),
					body: requiredString(input, "body"),
					idempotencyKey: inputString(input, "idempotencyKey"),
				},
				sessionId,
			);
			break;
		}
		case "record-review-gate": {
			body = await recordTeamReviewGateArtifact(
				cwd,
				{
					teamId: inputString(input, "teamId"),
					taskId: requiredString(input, "taskId"),
					reviewReport: requiredObject(input, "reviewReport"),
					recordedBy: inputString(input, "recordedBy"),
				},
				sessionId,
			);
			break;
		}
		case "record-completion-gate": {
			body = await recordTeamCompletionGateArtifact(
				cwd,
				{
					teamId: inputString(input, "teamId"),
					evidenceMatrix: requiredObject(input, "evidenceMatrix"),
					recordedBy: inputString(input, "recordedBy"),
				},
				sessionId,
			);
			break;
		}
		case "complete": {
			body = await completeTeam(
				cwd,
				{
					teamId: inputString(input, "teamId"),
					phase: inputString(input, "phase") as "complete" | "failed" | "cancelled" | undefined,
					summary: inputString(input, "summary"),
				},
				sessionId,
			);
			break;
		}
		case "spawn-task-agent": {
			throw new Error(
				"pi workflow team spawn-task-agent is removed; use the team_spawn_task_agent model-visible tool to spawn a team worker",
			);
		}
	}
	return { status: 0, stdout: output({ ok: true, body }, json), stderr: "" };
}

async function ultragoalVerb(
	action: string | undefined,
	input: Record<string, unknown>,
	json: boolean,
	cwd: string,
): Promise<WorkflowCommandResult> {
	const sessionId = sessionIdFromInput(input);
	const valid = new Set([
		"create-plan",
		"status",
		"read-compact",
		"start-next",
		"checkpoint",
		"record-review-blockers",
		"classify-blocker",
		"guard",
		"spawn-goal-agent",
	]);
	if (!action || !valid.has(action)) throw new Error(`unsupported pi workflow ultragoal verb: ${action ?? "(none)"}`);
	let body: unknown;
	switch (action) {
		case "create-plan": {
			body = await createUltragoalPlan(
				cwd,
				{
					brief: requiredString(input, "brief"),
					goalMode: inputString(input, "goalMode") as UltragoalGoalMode | undefined,
				},
				sessionId,
			);
			break;
		}
		case "status": {
			body = await getUltragoalStatus(cwd, sessionId);
			break;
		}
		case "read-compact": {
			body = await readUltragoalCompact(cwd, sessionId);
			break;
		}
		case "start-next": {
			body = await startNextUltragoalGoal(cwd, input.retryFailed === true, sessionId);
			break;
		}
		case "checkpoint": {
			body = await checkpointUltragoalGoal(
				cwd,
				{
					goalId: requiredString(input, "goalId"),
					status: requiredString(input, "status"),
					evidence: inputString(input, "evidence"),
					qualityGate: (input.qualityGate as Record<string, unknown>) ?? undefined,
				},
				sessionId,
			);
			break;
		}
		case "record-review-blockers": {
			body = await recordUltragoalReviewBlockers(
				cwd,
				{
					goalId: requiredString(input, "goalId"),
					title: requiredString(input, "title"),
					objective: requiredString(input, "objective"),
					evidence: requiredString(input, "evidence"),
				},
				sessionId,
			);
			break;
		}
		case "classify-blocker": {
			body = await recordUltragoalBlockerClassification(
				cwd,
				{
					goalId: inputString(input, "goalId"),
					classification: requiredString(input, "classification") as UltragoalBlockerClassification,
					evidence: requiredString(input, "evidence"),
				},
				sessionId,
			);
			break;
		}
		case "guard": {
			body = await ultragoalGuard(cwd, sessionId, {
				goalId: inputString(input, "goalId"),
				currentObjective: inputString(input, "currentObjective"),
			});
			break;
		}
		case "spawn-goal-agent": {
			throw new Error(
				"pi workflow ultragoal spawn-goal-agent is removed; use the ultragoal_spawn_goal_agent model-visible tool to spawn an ultragoal worker",
			);
		}
	}
	return { status: 0, stdout: output({ ok: true, body }, json), stderr: "" };
}

async function dispatch(parsed: ParsedWorkflowCommand, cwd: string): Promise<WorkflowCommandResult> {
	if (parsed.help) return { status: 0, stdout: usage(), stderr: "" };
	if (parsed.verb !== "gc" && (parsed.prune || parsed.dryRun)) {
		throw new Error(`--prune/--dry-run are only supported for pi workflow gc, not ${parsed.verb}`);
	}
	const input = await parseWorkflowInput(parsed, cwd);
	if (parsed.verb === "start") return start(input, parsed.json);
	if (parsed.verb === "owner") return runOwner(input);
	if (parsed.verb === "submit") return submit(input, parsed.json);
	if (parsed.verb === "observe") return observe(input, parsed.json);
	if (parsed.verb === "classify") return classify(input, parsed.json);
	if (parsed.verb === "recover") return recover(input, parsed.json);
	if (parsed.verb === "validate") return validate(input, parsed.json);
	if (parsed.verb === "finalize") return finalize(input, parsed.json);
	if (parsed.verb === "operate") return operateCmd(input, parsed.json);
	if (parsed.verb === "subagent")
		throw new Error(
			"unsupported singular workflow subagent form; subagent spawning is a model-visible tool, not a pi workflow command",
		);
	if (parsed.verb === "subagents")
		throw new Error(
			"pi workflow subagents is removed; use the subagent_spawn / subagent_status / subagent_await / subagent_steer / subagent_pause / subagent_resume / subagent_cancel model-visible tools instead",
		);
	if (parsed.verb === "gc") return gc({ prune: parsed.prune, dryRun: parsed.dryRun, json: parsed.json, input, cwd });
	if (parsed.verb === "events") return events(input, parsed.json);
	if (parsed.verb === "retire") return retire(input, parsed.json);
	if (parsed.verb === "deep-interview") return deepInterviewVerb(parsed.subverb, input, parsed.json, cwd);
	if (parsed.verb === "ralplan") return ralplanVerb(parsed.subverb, input, parsed.json, cwd);
	if (parsed.verb === "team") return teamVerb(parsed.subverb, input, parsed.json, cwd);
	if (parsed.verb === "ultragoal") return ultragoalVerb(parsed.subverb, input, parsed.json, cwd);
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

/**
 * Dispatcher contract entry point.
 *
 * `pi`'s package-command dispatcher (`dispatchPreSessionPackageCommand`)
 * dynamically imports this command resource and calls `handlePackageCommand`.
 * It passes the full args (with `args[0] === "workflow"`), so we delegate to
 * `handleWorkflowCommand`, which performs the verb check and I/O. `ctx` is
 * provided by the dispatcher but unused here (handlers derive `cwd` from
 * `process.cwd()`); kept optional for contract conformance.
 */
export async function handlePackageCommand(args: string[], _ctx?: unknown): Promise<boolean> {
	return handleWorkflowCommand(args);
}
