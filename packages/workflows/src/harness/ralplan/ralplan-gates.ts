import { validateContextMapVerdict } from "../shared/gate-verdicts.ts";
import { ralplanGateArtifactPath, workflowStatePath } from "../shared/session-layout.ts";
import { writeJsonAtomic } from "../shared/state-writer.ts";
import {
	activeRalplanRunId,
	defaultWorkflowId,
	readWorkflowState,
	writeWorkflowState,
} from "../shared/workflow-state.ts";

export interface RalplanExplorerGate {
	gate: "explorer";
	status: "passed" | "retry_requested" | "human_blocked";
	attempt: number;
	artifact_path?: string;
	context_needed?: boolean;
	summary?: string;
	reason?: string;
	updated_at: string;
}

function nowIso(): string {
	return new Date().toISOString();
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function normalizeRalplanExplorerGate(value: unknown): RalplanExplorerGate | undefined {
	if (!isPlainObject(value)) return undefined;
	if (value.gate !== "explorer") return undefined;
	if (value.status !== "passed" && value.status !== "retry_requested" && value.status !== "human_blocked")
		return undefined;
	return {
		gate: "explorer",
		status: value.status,
		attempt: typeof value.attempt === "number" && Number.isInteger(value.attempt) ? value.attempt : 0,
		artifact_path: typeof value.artifact_path === "string" ? value.artifact_path : undefined,
		context_needed: typeof value.context_needed === "boolean" ? value.context_needed : undefined,
		summary: typeof value.summary === "string" ? value.summary : undefined,
		reason: typeof value.reason === "string" ? value.reason : undefined,
		updated_at: typeof value.updated_at === "string" ? value.updated_at : nowIso(),
	};
}

export async function recordRalplanExplorerGateArtifact(
	cwd: string,
	input: { runId?: string; contextMap: unknown; recordedBy?: string },
	sessionId: string,
): Promise<RalplanExplorerGate> {
	const runId = input.runId?.trim() || (await activeRalplanRunId(cwd, sessionId)) || defaultWorkflowId("ralplan");
	const state = (await readWorkflowState(cwd, "ralplan", { sessionId })) ?? { current_phase: "planner" };
	const existing = normalizeRalplanExplorerGate(state.explorer_gate);
	const verdict = validateContextMapVerdict(input.contextMap);
	const attempt = (existing?.attempt ?? 0) + 1;
	const artifactPath = ralplanGateArtifactPath(cwd, runId, "explorer", attempt, sessionId);
	await writeJsonAtomic(
		artifactPath,
		{
			artifact_type: "context_map",
			run_id: runId,
			gate: "explorer",
			attempt,
			recorded_by: input.recordedBy ?? "explorer",
			recorded_at: nowIso(),
			...verdict,
		},
		{ cwd },
	);
	const gate: RalplanExplorerGate = {
		gate: "explorer",
		status: "passed",
		attempt,
		artifact_path: artifactPath,
		context_needed: verdict.context_needed,
		summary: verdict.summary,
		updated_at: nowIso(),
	};
	await writeWorkflowState(
		cwd,
		"ralplan",
		{ ...state, run_id: runId, explorer_gate: gate, current_phase: state.current_phase ?? "planner" },
		"pi ralplan record-explorer-gate",
		{ sessionId },
	);
	return gate;
}

export async function assertRalplanExplorerGatePassed(cwd: string, runId: string, sessionId: string): Promise<void> {
	const state = await readWorkflowState(cwd, "ralplan", { sessionId });
	const gate = normalizeRalplanExplorerGate(state?.explorer_gate);
	if (gate?.status === "passed" && gate.artifact_path) return;
	const attempt = (gate?.attempt ?? 0) + 1;
	const status = attempt >= 2 ? "human_blocked" : "retry_requested";
	const reason = "ralplan planner requires a passing explorer context_map";
	await writeWorkflowState(
		cwd,
		"ralplan",
		{
			...(state ?? {}),
			run_id: runId,
			current_phase: state?.current_phase ?? "planner",
			explorer_gate: {
				gate: "explorer",
				status,
				attempt,
				reason,
				updated_at: nowIso(),
			} satisfies RalplanExplorerGate,
		},
		"pi ralplan explorer-gate-block",
		{ sessionId },
	);
	throw new Error(`${reason}; explorer gate ${status}`);
}

export function ralplanExplorerGateStatePath(cwd: string, sessionId: string): string {
	return workflowStatePath(cwd, "ralplan", sessionId);
}
