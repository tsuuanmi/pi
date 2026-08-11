import { readFile } from "node:fs/promises";
import type { RalplanStage } from "#workflows/session/paths";
import { ralplanIndexPath, ralplanPendingApprovalPath, workflowStatePath } from "#workflows/session/session-layout";
import { roleForStage } from "#workflows/skills/ralplan/agent-roles";
import type {
	RalplanIndexRow,
	RalplanInvalidIndexLine,
	RalplanPlannerStateUpdate,
	RalplanStatus,
	RalplanWriteArtifactInput,
} from "#workflows/skills/ralplan/types";
import { isRalplanVerdict, type RalplanVerdict } from "#workflows/skills/ralplan/verdicts";
import { canonicalizeJson, sha256 } from "#workflows/state/state-writer";
import { readWorkflowState } from "#workflows/state/workflow-state";

const RALPLAN_ITERATE_CAP_DEFAULT = 5;
const RALPLAN_EXPERT_CAP_DEFAULT = 3;

export function ralplanCompletionRole(stage: RalplanStage): string {
	if (stage === "final") return "pi";
	return roleForStage(stage);
}

const RALPLAN_PHASE_LOCK = new Set(["expert-stage", "final", "handoff", "complete", "failed", "cancelled"]);

function requireIndexString(value: unknown, field: string): string {
	if (typeof value !== "string" || value.length === 0 || value.trim() !== value) {
		throw new Error(`${field} must be a non-empty, trimmed string`);
	}
	return value;
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function parseRalplanIndexLine(line: string): { row?: RalplanIndexRow; error?: string } {
	const trimmed = line.trim();
	if (!trimmed) return {};
	let parsed: unknown;
	try {
		parsed = JSON.parse(trimmed) as unknown;
	} catch (error) {
		return { error: error instanceof Error ? error.message : String(error) };
	}
	if (!isPlainObject(parsed)) return { error: "index row must be a JSON object" };
	const stage = parsed.stage;
	if (
		stage !== "pre-planner" &&
		stage !== "planner" &&
		stage !== "architect" &&
		stage !== "critic" &&
		stage !== "revision" &&
		stage !== "adr" &&
		stage !== "final" &&
		stage !== "expert-stage"
	) {
		return { error: "index row has unknown stage" };
	}
	if (!Number.isInteger(parsed.stage_n) || (parsed.stage_n as number) < 1) {
		return { error: "index row stage_n must be a positive integer" };
	}
	try {
		const path = requireIndexString(parsed.path, "index row path");
		const hash = requireIndexString(parsed.sha256, "index row sha256");
		if (!/^[a-f0-9]{64}$/u.test(hash))
			return { error: "index row sha256 must be a lowercase 64-character hex digest" };
		const createdAt = requireIndexString(parsed.created_at, "index row created_at");
		if (new Date(createdAt).toISOString() !== createdAt) {
			return { error: "index row created_at must be a canonical ISO timestamp" };
		}
		if (parsed.verdict !== undefined && !isRalplanVerdict(parsed.verdict)) {
			return { error: "index row verdict is malformed" };
		}
		return {
			row: {
				stage,
				stage_n: parsed.stage_n as number,
				path,
				sha256: hash,
				created_at: createdAt,
				...(parsed.verdict !== undefined ? { verdict: parsed.verdict } : {}),
			},
		};
	} catch (error) {
		return { error: error instanceof Error ? error.message : String(error) };
	}
}

export function ralplanIndexKey(entry: unknown): string | undefined {
	if (!isPlainObject(entry)) return undefined;
	if (
		typeof entry.stage !== "string" ||
		entry.stage.length === 0 ||
		entry.stage.trim() !== entry.stage ||
		!Number.isInteger(entry.stage_n) ||
		(entry.stage_n as number) < 1 ||
		typeof entry.sha256 !== "string" ||
		!/^[a-f0-9]{64}$/u.test(entry.sha256)
	) {
		return undefined;
	}
	return `${entry.stage}\u0000${entry.stage_n}\u0000${entry.sha256}`;
}

export async function readRalplanIndex(
	cwd: string,
	runId: string,
	sessionId: string,
): Promise<{
	rows: RalplanIndexRow[];
	invalidLines: RalplanInvalidIndexLine[];
}> {
	try {
		const text = await readFile(ralplanIndexPath(cwd, runId, sessionId), "utf8");
		const rows: RalplanIndexRow[] = [];
		const invalidLines: RalplanInvalidIndexLine[] = [];
		text.split(/\r?\n/).forEach((line, index) => {
			const parsed = parseRalplanIndexLine(line);
			if (parsed.row) rows.push(parsed.row);
			else if (parsed.error) invalidLines.push({ line: index + 1, reason: parsed.error, text: line.slice(0, 200) });
		});
		return { rows, invalidLines };
	} catch (error) {
		const err = error as NodeJS.ErrnoException;
		if (err.code === "ENOENT") return { rows: [], invalidLines: [] };
		throw error;
	}
}

export function latestForStageN(
	rows: readonly RalplanIndexRow[],
	stage: RalplanStage,
	stageN: number,
): RalplanIndexRow | undefined {
	let found: RalplanIndexRow | undefined;
	for (const row of rows) if (row.stage === stage && row.stage_n === stageN) found = row;
	return found;
}

export function summarizeRows(
	rows: readonly RalplanIndexRow[],
): Pick<RalplanStatus, "iteration" | "stages" | "latest"> {
	const stages: Partial<Record<RalplanStage, number>> = {};
	let iteration = 0;
	let latest: RalplanIndexRow | undefined;
	for (const row of rows) {
		stages[row.stage] = Math.max(stages[row.stage] ?? 0, row.stage_n);
		iteration = Math.max(iteration, row.stage_n);
		latest = row;
	}
	return { iteration: iteration || undefined, stages, latest };
}

export function nextPhase(existingPhase: unknown, stage: RalplanStage): string {
	const current = typeof existingPhase === "string" ? existingPhase.trim() : "";
	if (current && RALPLAN_PHASE_LOCK.has(current)) return current;
	return stage === "final" ? "pending-approval" : stage;
}

export function ralplanProgressPatch(
	previousState: Record<string, unknown> | undefined,
	stage: RalplanStage,
	verdict: RalplanVerdict | undefined,
): Record<string, unknown> {
	const cap =
		typeof previousState?.iterate_cap === "number" && previousState.iterate_cap > 0
			? previousState.iterate_cap
			: RALPLAN_ITERATE_CAP_DEFAULT;
	const priorCount = typeof previousState?.iterate_count === "number" ? previousState.iterate_count : 0;
	const increments = verdict?.role === "critic" && (verdict.verdict === "iterate" || verdict.verdict === "reject");
	const nextCount = increments ? priorCount + 1 : priorCount;
	const expertCap =
		typeof previousState?.expert_cap === "number" && previousState.expert_cap > 0
			? previousState.expert_cap
			: RALPLAN_EXPERT_CAP_DEFAULT;
	const priorExpertCount = typeof previousState?.expert_count === "number" ? previousState.expert_count : 0;
	const expertCount = stage === "expert-stage" ? priorExpertCount + 1 : priorExpertCount;
	if (stage === "expert-stage" && priorExpertCount >= expertCap) {
		throw new Error(`ralplan expert loop cap reached: ${priorExpertCount}/${expertCap}`);
	}
	return {
		iterate_count: nextCount,
		iterate_cap: cap,
		expert_count: expertCount,
		expert_cap: expertCap,
		...(nextCount >= cap ? { expert_escalation: true, current_phase: "expert-stage" } : {}),
	};
}

function isSafePlannerId(value: string): boolean {
	return /^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$/.test(value) && !value.includes("..");
}

export function plannerStateUpdate(input: RalplanWriteArtifactInput): RalplanPlannerStateUpdate | undefined {
	const update: RalplanPlannerStateUpdate = {};
	if (input.plannerSubagentId !== undefined) {
		if (!isSafePlannerId(input.plannerSubagentId))
			throw new Error(`invalid plannerSubagentId: ${input.plannerSubagentId}`);
		update.plannerSubagentId = input.plannerSubagentId;
	}
	if (input.plannerResumable !== undefined) update.plannerResumable = input.plannerResumable;
	return Object.keys(update).length > 0 ? update : undefined;
}

export function plannerStatePatch(update: RalplanPlannerStateUpdate | undefined): Record<string, unknown> {
	if (!update) return {};
	return {
		...(update.plannerSubagentId !== undefined ? { planner_subagent_id: update.plannerSubagentId } : {}),
		...(update.plannerResumable !== undefined ? { planner_resumable: update.plannerResumable } : {}),
	};
}

export function isApprovalClosed(phase: unknown): boolean {
	return phase === "approved" || phase === "handoff" || phase === "complete";
}

export async function readRalplanStatus(cwd: string, sessionId: string, runIdInput?: string): Promise<RalplanStatus> {
	const effectiveRunIdInput = runIdInput;
	const state = await readWorkflowState(cwd, "ralplan", { sessionId });
	const runId =
		effectiveRunIdInput === undefined
			? typeof state?.run_id === "string"
				? state.run_id
				: undefined
			: effectiveRunIdInput.trim();
	if (effectiveRunIdInput !== undefined && !runId) throw new Error("ralplan runId must not be empty");
	const index = runId ? await readRalplanIndex(cwd, runId, sessionId) : { rows: [], invalidLines: [] };
	const summary = summarizeRows(index.rows);
	const pendingApprovalPath = runId ? ralplanPendingApprovalPath(cwd, runId, sessionId) : undefined;
	const statePendingPath = typeof state?.pending_approval_path === "string" ? state.pending_approval_path : undefined;
	return {
		run_id: runId,
		state_path: workflowStatePath(cwd, "ralplan", sessionId),
		state,
		index_path: runId ? ralplanIndexPath(cwd, runId, sessionId) : undefined,
		rows: index.rows,
		invalid_index_lines: index.invalidLines,
		...summary,
		pending_approval_path: statePendingPath ?? pendingApprovalPath,
		pending_approval:
			!isApprovalClosed(state?.current_phase) &&
			(state?.current_phase === "pending-approval" || summary.latest?.stage === "final"),
	};
}

export function ralplanWriteFingerprint(value: unknown): string {
	return sha256(JSON.stringify(canonicalizeJson(value)));
}

export type { RalplanIndexRow, RalplanInvalidIndexLine, RalplanStatus };
