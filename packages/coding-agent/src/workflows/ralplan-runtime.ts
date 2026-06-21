import { readFile } from "node:fs/promises";
import { applyHandoffToActiveState, syncWorkflowActiveState } from "./active-state.ts";
import type { RalplanStage, WorkflowSkill } from "./paths.ts";
import { ralplanIndexPath, ralplanPendingApprovalPath, ralplanStageArtifactPath, workflowStatePath } from "./paths.ts";
import { buildRalplanHud } from "./ralplan-hud.ts";
import { appendJsonlIdempotent, readFileOrLiteral, sha256, writeTextArtifact } from "./state-writer.ts";
import { activeRalplanRunId, defaultWorkflowId, readWorkflowState, writeWorkflowState } from "./workflow-state.ts";

export interface RalplanPlannerStateUpdate {
	plannerSubagentId?: string;
	plannerResumable?: boolean;
}

export interface RalplanWriteArtifactInput extends RalplanPlannerStateUpdate {
	stage: RalplanStage;
	stageN: number;
	artifact: string;
	runId?: string;
}

export interface RalplanIndexRow {
	stage: RalplanStage;
	stage_n: number;
	path: string;
	sha256: string;
	created_at: string;
}

export interface RalplanWriteArtifactResult {
	runId: string;
	path: string;
	stage: RalplanStage;
	stageN: number;
	sha256: string;
	createdAt: string;
	pendingApprovalPath?: string;
	deduplicated: boolean;
	plannerState?: RalplanPlannerStateUpdate;
}

export interface RalplanInvalidIndexLine {
	line: number;
	reason: string;
	text: string;
}

export interface RalplanStatus {
	run_id?: string;
	state_path: string;
	state?: Record<string, unknown>;
	index_path?: string;
	rows: RalplanIndexRow[];
	invalid_index_lines: RalplanInvalidIndexLine[];
	iteration?: number;
	stages: Partial<Record<RalplanStage, number>>;
	latest?: RalplanIndexRow;
	pending_approval_path?: string;
	pending_approval: boolean;
}

export interface RalplanCompactStatus {
	run_id?: string;
	phase?: string;
	iteration?: number;
	stages: Partial<Record<RalplanStage, number>>;
	latest?: Pick<RalplanIndexRow, "stage" | "stage_n" | "path" | "created_at">;
	pending_approval: boolean;
	pending_approval_path?: string;
	invalid_index_line_count: number;
}

export type RalplanApprovalTarget = "ultragoal" | "team" | "stop";

export interface RalplanApproveResult {
	runId: string;
	approved: boolean;
	target: RalplanApprovalTarget;
	pendingApprovalPath: string;
	ralplanState: Record<string, unknown>;
	targetState?: Record<string, unknown>;
}

export interface RalplanDoctorResult {
	ok: boolean;
	problems: string[];
	warnings: string[];
	status: RalplanStatus;
}

const RALPLAN_PHASE_LOCK = new Set([
	"final",
	"handoff",
	"complete",
	"completed",
	"failed",
	"cancelled",
	"canceled",
	"inactive",
]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseRalplanIndexLine(line: string): { row?: RalplanIndexRow; error?: string } {
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
		stage !== "planner" &&
		stage !== "architect" &&
		stage !== "critic" &&
		stage !== "revision" &&
		stage !== "adr" &&
		stage !== "final"
	) {
		return { error: "index row has unknown stage" };
	}
	if (typeof parsed.stage_n !== "number" || typeof parsed.path !== "string" || typeof parsed.sha256 !== "string") {
		return { error: "index row is missing required stage_n/path/sha256 fields" };
	}
	return {
		row: {
			stage,
			stage_n: parsed.stage_n,
			path: parsed.path,
			sha256: parsed.sha256,
			created_at: typeof parsed.created_at === "string" ? parsed.created_at : "",
		},
	};
}

function ralplanIndexKey(entry: unknown): string | undefined {
	if (!isPlainObject(entry)) return undefined;
	if (typeof entry.stage !== "string" || typeof entry.stage_n !== "number" || typeof entry.sha256 !== "string") {
		return undefined;
	}
	return `${entry.stage}\u0000${entry.stage_n}\u0000${entry.sha256}`;
}

async function readRalplanIndex(
	cwd: string,
	runId: string,
): Promise<{
	rows: RalplanIndexRow[];
	invalidLines: RalplanInvalidIndexLine[];
}> {
	try {
		const text = await readFile(ralplanIndexPath(cwd, runId), "utf8");
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

function latestForStageN(
	rows: readonly RalplanIndexRow[],
	stage: RalplanStage,
	stageN: number,
): RalplanIndexRow | undefined {
	let found: RalplanIndexRow | undefined;
	for (const row of rows) if (row.stage === stage && row.stage_n === stageN) found = row;
	return found;
}

function summarizeRows(rows: readonly RalplanIndexRow[]): Pick<RalplanStatus, "iteration" | "stages" | "latest"> {
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

function nextPhase(existingPhase: unknown, stage: RalplanStage): string {
	const current = typeof existingPhase === "string" ? existingPhase.trim() : "";
	if (current && RALPLAN_PHASE_LOCK.has(current)) return current;
	return stage === "final" ? "pending-approval" : stage;
}

function isSafePlannerId(value: string): boolean {
	return /^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$/.test(value) && !value.includes("..");
}

function plannerStateUpdate(input: RalplanWriteArtifactInput): RalplanPlannerStateUpdate | undefined {
	const update: RalplanPlannerStateUpdate = {};
	if (input.plannerSubagentId !== undefined) {
		if (!isSafePlannerId(input.plannerSubagentId))
			throw new Error(`invalid plannerSubagentId: ${input.plannerSubagentId}`);
		update.plannerSubagentId = input.plannerSubagentId;
	}
	if (input.plannerResumable !== undefined) update.plannerResumable = input.plannerResumable;
	return Object.keys(update).length > 0 ? update : undefined;
}

function plannerStatePatch(update: RalplanPlannerStateUpdate | undefined): Record<string, unknown> {
	if (!update) return {};
	return {
		...(update.plannerSubagentId !== undefined ? { planner_subagent_id: update.plannerSubagentId } : {}),
		...(update.plannerResumable !== undefined ? { planner_resumable: update.plannerResumable } : {}),
	};
}

function isApprovalClosed(phase: unknown): boolean {
	return phase === "approved" || phase === "handoff" || phase === "complete" || phase === "completed";
}

export async function readRalplanStatus(cwd: string, runIdInput?: string): Promise<RalplanStatus> {
	const state = await readWorkflowState(cwd, "ralplan");
	const runId = runIdInput?.trim() || (typeof state?.run_id === "string" ? state.run_id : undefined);
	const index = runId ? await readRalplanIndex(cwd, runId) : { rows: [], invalidLines: [] };
	const summary = summarizeRows(index.rows);
	const pendingApprovalPath = runId ? ralplanPendingApprovalPath(cwd, runId) : undefined;
	const statePendingPath = typeof state?.pending_approval_path === "string" ? state.pending_approval_path : undefined;
	return {
		run_id: runId,
		state_path: workflowStatePath(cwd, "ralplan"),
		state,
		index_path: runId ? ralplanIndexPath(cwd, runId) : undefined,
		rows: index.rows,
		invalid_index_lines: index.invalidLines,
		...summary,
		pending_approval_path: statePendingPath ?? pendingApprovalPath,
		pending_approval:
			!isApprovalClosed(state?.current_phase) &&
			(state?.current_phase === "pending-approval" || summary.latest?.stage === "final"),
	};
}

export async function readRalplanCompactStatus(cwd: string, runId?: string): Promise<RalplanCompactStatus> {
	const status = await readRalplanStatus(cwd, runId);
	return {
		run_id: status.run_id,
		phase: typeof status.state?.current_phase === "string" ? status.state.current_phase : undefined,
		iteration: status.iteration,
		stages: status.stages,
		latest: status.latest
			? {
					stage: status.latest.stage,
					stage_n: status.latest.stage_n,
					path: status.latest.path,
					created_at: status.latest.created_at,
				}
			: undefined,
		pending_approval: status.pending_approval,
		pending_approval_path: status.pending_approval_path,
		invalid_index_line_count: status.invalid_index_lines.length,
	};
}

export async function writeRalplanArtifact(
	cwd: string,
	input: RalplanWriteArtifactInput,
	sessionId?: string,
): Promise<RalplanWriteArtifactResult> {
	const runId = input.runId?.trim() || (await activeRalplanRunId(cwd)) || defaultWorkflowId("ralplan");
	const content = await readFileOrLiteral(input.artifact, cwd);
	const body = content.endsWith("\n") ? content : `${content}\n`;
	const contentSha = sha256(body);
	const plannerState = plannerStateUpdate(input);
	const index = await readRalplanIndex(cwd, runId);
	const existing = latestForStageN(index.rows, input.stage, input.stageN);
	if (existing) {
		if (existing.sha256 !== contentSha) {
			throw new Error(
				`refusing to overwrite ralplan ${input.stage} stage ${input.stageN} at ${existing.path}: an artifact with different content already exists (existing sha256=${existing.sha256}, new sha256=${contentSha}). Use a new stageN to record another pass.`,
			);
		}
		return {
			runId,
			path: existing.path,
			stage: input.stage,
			stageN: input.stageN,
			sha256: contentSha,
			createdAt: existing.created_at,
			pendingApprovalPath: input.stage === "final" ? ralplanPendingApprovalPath(cwd, runId) : undefined,
			deduplicated: true,
			plannerState,
		};
	}

	const artifact = await writeTextArtifact(ralplanStageArtifactPath(cwd, runId, input.stageN, input.stage), body, {
		cwd,
	});
	await appendJsonlIdempotent(
		ralplanIndexPath(cwd, runId),
		{
			stage: input.stage,
			stage_n: input.stageN,
			path: artifact.path,
			sha256: artifact.sha256,
			created_at: artifact.createdAt,
		},
		{ cwd, key: ralplanIndexKey },
	);
	let pendingApprovalPath: string | undefined;
	if (input.stage === "final") {
		pendingApprovalPath = ralplanPendingApprovalPath(cwd, runId);
		await writeTextArtifact(pendingApprovalPath, body, { cwd });
	}
	const previousState = await readWorkflowState(cwd, "ralplan").catch(() => undefined);
	const state = await writeWorkflowState(cwd, "ralplan", {
		active: true,
		current_phase: nextPhase(previousState?.current_phase, input.stage),
		run_id: runId,
		latest_artifact_path: artifact.path,
		pending_approval_path: pendingApprovalPath,
		...plannerStatePatch(plannerState),
	});
	const status = await readRalplanStatus(cwd, runId);
	await syncWorkflowActiveState(
		cwd,
		{
			skill: "ralplan",
			active: state.active,
			phase: state.current_phase,
			state_path: workflowStatePath(cwd, "ralplan"),
			hud: buildRalplanHud(status),
		},
		sessionId ? { sessionId } : undefined,
	);
	return {
		runId,
		path: artifact.path,
		stage: input.stage,
		stageN: input.stageN,
		sha256: artifact.sha256,
		createdAt: artifact.createdAt,
		pendingApprovalPath,
		deduplicated: false,
		plannerState,
	};
}

export async function approveRalplanPlan(
	cwd: string,
	options: { runId?: string; target?: RalplanApprovalTarget; approved?: boolean; note?: string; sessionId?: string },
): Promise<RalplanApproveResult> {
	const target = options.target ?? "ultragoal";
	const approved = options.approved !== false;
	const status = await readRalplanStatus(cwd, options.runId);
	if (!status.run_id)
		throw new Error(
			"cannot approve ralplan without a run_id: no artifacts have been persisted yet. Run the planner stage (ralplan_run_agent / ralplan_write_artifact) first, then run ralplan_doctor if the run still looks inconsistent.",
		);
	if (!status.pending_approval || !status.pending_approval_path) {
		throw new Error("cannot approve ralplan: no pending approval plan is available");
	}
	await readFile(status.pending_approval_path, "utf8");
	const now = new Date().toISOString();
	const ralplanState = await writeWorkflowState(cwd, "ralplan", {
		active: false,
		current_phase: approved ? (target === "stop" ? "approved" : "handoff") : "rejected",
		run_id: status.run_id,
		pending_approval_path: status.pending_approval_path,
		approved,
		approval_target: target,
		approval_note: options.note,
		approved_at: approved ? now : undefined,
		rejected_at: approved ? undefined : now,
	});
	const sessionOpts = options.sessionId ? { sessionId: options.sessionId } : undefined;
	let targetState: Record<string, unknown> | undefined;
	if (approved && target !== "stop") {
		const targetSkill: WorkflowSkill = target;
		targetState = await writeWorkflowState(cwd, targetSkill, {
			active: true,
			current_phase: "approved-execution",
			input: status.pending_approval_path,
			source_workflow: "ralplan",
			source_run_id: status.run_id,
		});
		// Atomic handoff: demote ralplan + promote target in a single write.
		await applyHandoffToActiveState({
			cwd,
			caller: {
				skill: "ralplan",
				phase: ralplanState.current_phase,
				state_path: workflowStatePath(cwd, "ralplan"),
			},
			callee: {
				skill: targetSkill,
				phase: typeof targetState.current_phase === "string" ? targetState.current_phase : undefined,
				state_path: workflowStatePath(cwd, targetSkill),
			},
			...(options.sessionId ? { sessionId: options.sessionId } : {}),
		});
	} else {
		// No handoff target — just deactivate ralplan.
		await syncWorkflowActiveState(
			cwd,
			{
				skill: "ralplan",
				active: false,
				phase: ralplanState.current_phase,
				state_path: workflowStatePath(cwd, "ralplan"),
			},
			sessionOpts,
		);
	}
	return {
		runId: status.run_id,
		approved,
		target,
		pendingApprovalPath: status.pending_approval_path,
		ralplanState,
		targetState,
	};
}

export async function doctorRalplan(cwd: string, runId?: string): Promise<RalplanDoctorResult> {
	const status = await readRalplanStatus(cwd, runId);
	const problems: string[] = [];
	const warnings: string[] = [];
	if (!status.run_id) problems.push("missing ralplan run_id");
	for (const line of status.invalid_index_lines) problems.push(`invalid index line ${line.line}: ${line.reason}`);
	const seen = new Map<string, RalplanIndexRow>();
	for (const row of status.rows) {
		const key = `${row.stage}:${row.stage_n}`;
		const prior = seen.get(key);
		if (prior && prior.sha256 !== row.sha256) problems.push(`conflicting index rows for ${key}`);
		seen.set(key, row);
		try {
			const content = await readFile(row.path, "utf8");
			if (sha256(content) !== row.sha256) problems.push(`sha256 mismatch for ${row.path}`);
		} catch (error) {
			const err = error as NodeJS.ErrnoException;
			problems.push(`cannot read artifact ${row.path}: ${err.message}`);
		}
	}
	if (status.pending_approval) {
		if (!status.pending_approval_path) problems.push("pending approval phase has no pending_approval_path");
		else {
			try {
				await readFile(status.pending_approval_path, "utf8");
			} catch {
				problems.push(`pending approval artifact is missing: ${status.pending_approval_path}`);
			}
		}
	}
	if (status.rows.length === 0) warnings.push("ralplan index is empty");
	return { ok: problems.length === 0, problems, warnings, status };
}
