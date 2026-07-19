import { readdir, readFile } from "node:fs/promises";
import { dirname } from "node:path";
import { writeStageArtifact } from "#workflows/artifacts/artifacts";
import { type FailSoftError, recordFailSoftError } from "#workflows/audit/audit-log";
import { projectCompactStateFor } from "#workflows/compaction/compaction";
import { handoffWorkflow } from "#workflows/orchestration/handoff";
import type { RalplanStage, WorkflowSkill } from "#workflows/session/paths";
import {
	ralplanIndexPath,
	ralplanPendingApprovalPath,
	ralplanStageArtifactPath,
	transactionJournalPath,
	workflowStatePath,
} from "#workflows/session/session-layout";
import { ralplanRoleForStage } from "#workflows/skills/ralplan/ralplan-agents";
import {
	beginRalplanCompletionJournal,
	commitRalplanCompletionJournal,
	markRalplanCompletionStep,
	ralplanCompletionMutationId,
	ralplanCompletionProvenancePath,
	recordRalplanRollback,
	withRalplanCompletionLock,
	writeRalplanCompletionProvenance,
} from "#workflows/skills/ralplan/ralplan-completion-transaction";
import { buildRalplanHud } from "#workflows/skills/ralplan/ralplan-hud";
import {
	assertRalplanObstacle,
	type RalplanObstacleLedger,
	ralplanObstacleFromVerdict,
	readRalplanObstacleLedger,
	unresolvedRalplanObstacles,
	writeRalplanObstacle,
} from "#workflows/skills/ralplan/ralplan-obstacles";
import {
	isRalplanVerdict,
	parseRalplanVerdict,
	type RalplanCriticVerdictKind,
	type RalplanVerdict,
} from "#workflows/skills/ralplan/ralplan-verdicts";
import { syncWorkflowActiveState } from "#workflows/state/active-state";
import {
	appendJsonlIdempotent,
	canonicalizeJson,
	readFileOrLiteral,
	sha256,
	writeTextArtifact,
} from "#workflows/state/state-writer";
import {
	activeRalplanRunId,
	defaultWorkflowId,
	readWorkflowState,
	writeWorkflowState,
} from "#workflows/state/workflow-state";

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
	/** Parsed critic/architect verdict (R-1 prerequisite). Omitted for planner/revision/adr/final and when no confident verdict is found. */
	verdict?: RalplanVerdict;
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
	/** Parsed critic/architect verdict, when the stage produced one (R-1 prerequisite). */
	verdict?: RalplanVerdict;
	/** Fail-soft errors collected during the R-1 obstacle dual-write (durable copies in the audit log). */
	failSoftErrors?: FailSoftError[];
	/** Completion transaction journal path retained as deterministic commit evidence. */
	journalPath?: string;
	/** Completion provenance sidecar path. */
	completionProvenancePath?: string;
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
	/** Latest critic verdict at approval time, if a critic stage recorded one. */
	critic_verdict?: RalplanCriticVerdictKind;
	/** True when approval proceeded despite a REJECT verdict via `overrideCriticVerdict`. */
	critic_verdict_overridden?: boolean;
	/** Soft warning surfaced at approval (e.g. latest critic verdict is ITERATE). */
	approval_warning?: string;
	/** Fail-soft errors collected during the approval handoff ingest (durable copies in the audit log). */
	failSoftErrors?: FailSoftError[];
}

export interface RalplanDoctorResult {
	ok: boolean;
	problems: string[];
	warnings: string[];
	status: RalplanStatus;
}

const RALPLAN_ITERATE_CAP_DEFAULT = 5;
const RALPLAN_EXPERT_CAP_DEFAULT = 3;

function ralplanCompletionRole(stage: RalplanStage): string {
	try {
		return ralplanRoleForStage(stage);
	} catch {
		return "pi";
	}
}

const RALPLAN_PHASE_LOCK = new Set([
	"expert-stage",
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
	if (typeof parsed.stage_n !== "number" || typeof parsed.path !== "string" || typeof parsed.sha256 !== "string") {
		return { error: "index row is missing required stage_n/path/sha256 fields" };
	}
	const verdict = isRalplanVerdict(parsed.verdict) ? parsed.verdict : undefined;
	return {
		row: {
			stage,
			stage_n: parsed.stage_n,
			path: parsed.path,
			sha256: parsed.sha256,
			created_at: typeof parsed.created_at === "string" ? parsed.created_at : "",
			...(verdict ? { verdict } : {}),
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

function ralplanProgressPatch(
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

export async function readRalplanStatus(cwd: string, sessionId: string, runIdInput?: string): Promise<RalplanStatus> {
	const effectiveRunIdInput = runIdInput;
	const state = await readWorkflowState(cwd, "ralplan", { sessionId });
	const runId = effectiveRunIdInput?.trim() || (typeof state?.run_id === "string" ? state.run_id : undefined);
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

export async function readRalplanCompactStatus(
	cwd: string,
	sessionId: string,
	runId?: string,
): Promise<RalplanCompactStatus> {
	const status = await readRalplanStatus(cwd, sessionId, runId);
	return projectCompactStateFor<RalplanCompactStatus>("ralplan", status);
}

function ralplanWriteFingerprint(value: unknown): string {
	return sha256(JSON.stringify(canonicalizeJson(value)));
}

export async function writeRalplanArtifact(
	cwd: string,
	input: RalplanWriteArtifactInput,
	sessionId: string,
): Promise<RalplanWriteArtifactResult> {
	const runId = input.runId?.trim() || (await activeRalplanRunId(cwd, sessionId)) || defaultWorkflowId("ralplan");
	return withRalplanCompletionLock(cwd, sessionId, runId, async () => {
		const content = await readFileOrLiteral(input.artifact, cwd);
		const body = content.endsWith("\n") ? content : `${content}\n`;
		const contentSha = sha256(body);
		const plannerState = plannerStateUpdate(input);
		const verdict =
			input.stage === "critic" || input.stage === "architect" ? parseRalplanVerdict(input.stage, body) : undefined;
		const previousState = await readWorkflowState(cwd, "ralplan", { sessionId }).catch(() => undefined);
		const index = await readRalplanIndex(cwd, runId, sessionId);
		if (index.invalidLines.length > 0) {
			throw new Error(
				`refusing ralplan completion with invalid index lines: ${index.invalidLines.map((line) => line.line).join(",")}`,
			);
		}
		const artifactPath = ralplanStageArtifactPath(cwd, runId, input.stageN, input.stage, sessionId);
		const existing = latestForStageN(index.rows, input.stage, input.stageN);
		if (existing) {
			if (existing.sha256 !== contentSha || existing.path !== artifactPath) {
				throw new Error(
					`refusing to overwrite ralplan ${input.stage} stage ${input.stageN} at ${existing.path}: an artifact with different content already exists (existing sha256=${existing.sha256}, new sha256=${contentSha}). Use a new stageN to record another pass.`,
				);
			}
			let completionProvenancePath: string | undefined;
			try {
				completionProvenancePath = ralplanCompletionProvenancePath(existing.path);
				await readFile(completionProvenancePath, "utf8");
			} catch {
				const mutationId = ralplanCompletionMutationId({
					sessionId,
					runId,
					stage: input.stage,
					stageN: input.stageN,
					role: ralplanCompletionRole(input.stage),
					artifactPath: existing.path,
					artifactSha256: contentSha,
				});
				await writeRalplanCompletionProvenance({
					cwd,
					artifactPath: existing.path,
					sessionId,
					runId,
					stage: input.stage,
					stageN: input.stageN,
					role: ralplanCompletionRole(input.stage),
					artifactSha256: contentSha,
					mutationId,
					actor: "pi ralplan write-artifact sidecar repair",
					journalPath: "deduplicated-sidecar-repair",
				});
			}
			return {
				runId,
				path: existing.path,
				stage: input.stage,
				stageN: input.stageN,
				sha256: contentSha,
				createdAt: existing.created_at,
				pendingApprovalPath:
					input.stage === "final" ? ralplanPendingApprovalPath(cwd, runId, sessionId) : undefined,
				deduplicated: true,
				plannerState,
				completionProvenancePath,
				...(existing.verdict ? { verdict: existing.verdict } : {}),
			};
		}
		const beforeFingerprint = ralplanWriteFingerprint({
			previousState,
			rows: index.rows,
			invalid: index.invalidLines,
		});
		const progressPatch = ralplanProgressPatch(previousState, input.stage, verdict);
		const mutationId = ralplanCompletionMutationId({
			sessionId,
			runId,
			stage: input.stage,
			stageN: input.stageN,
			role: ralplanCompletionRole(input.stage),
			artifactPath,
			artifactSha256: contentSha,
		});
		const journalPath = await beginRalplanCompletionJournal({
			cwd,
			mutation_id: mutationId,
			session_id: sessionId,
			run_id: runId,
			stage: input.stage,
			stage_n: input.stageN,
			role: ralplanCompletionRole(input.stage),
			artifact_path: artifactPath,
			artifact_sha256: contentSha,
			snapshot_fingerprint: beforeFingerprint,
			paths: [artifactPath, ralplanIndexPath(cwd, runId, sessionId), workflowStatePath(cwd, "ralplan", sessionId)],
			steps: [
				"stage_artifact",
				"index_row",
				"pending_approval",
				"obstacle_ledger",
				"workflow_state",
				"completion_provenance",
				"active_hud",
				"commit",
			],
		});
		const rollbackRemovablePaths: string[] = [];
		try {
			const currentState = await readWorkflowState(cwd, "ralplan", { sessionId }).catch(() => undefined);
			const currentIndex = await readRalplanIndex(cwd, runId, sessionId);
			if (
				ralplanWriteFingerprint({
					previousState: currentState,
					rows: currentIndex.rows,
					invalid: currentIndex.invalidLines,
				}) !== beforeFingerprint
			) {
				throw new Error("stale ralplan completion snapshot; retry the write");
			}
			const artifact = await writeStageArtifact({ path: artifactPath, content: body }, { cwd });
			rollbackRemovablePaths.push(artifact.path);
			await markRalplanCompletionStep(cwd, sessionId, mutationId, "stage_artifact");
			await appendJsonlIdempotent(
				ralplanIndexPath(cwd, runId, sessionId),
				{
					stage: input.stage,
					stage_n: input.stageN,
					path: artifact.path,
					sha256: artifact.sha256,
					created_at: artifact.createdAt,
					...(verdict ? { verdict } : {}),
				},
				{ cwd, key: ralplanIndexKey },
			);
			await markRalplanCompletionStep(cwd, sessionId, mutationId, "index_row");
			// After the append-only index row is visible, do not delete the stage artifact during
			// rollback: removing it would leave the index pointing at a missing product artifact.
			rollbackRemovablePaths.length = 0;
			let pendingApprovalPath: string | undefined;
			if (input.stage === "final") {
				pendingApprovalPath = ralplanPendingApprovalPath(cwd, runId, sessionId);
				await writeTextArtifact(pendingApprovalPath, body, { cwd });
			}
			await markRalplanCompletionStep(cwd, sessionId, mutationId, "pending_approval");
			const failSoftErrors: FailSoftError[] = [];
			if (verdict) {
				const obstacle = ralplanObstacleFromVerdict(verdict, artifact.path, artifact.createdAt);
				if (obstacle) {
					try {
						assertRalplanObstacle(obstacle);
						await writeRalplanObstacle(cwd, runId, sessionId, obstacle);
					} catch (error) {
						const msg = error instanceof Error ? error.message : String(error);
						console.warn(`ralplan obstacle dual-write failed (R-1 fail-soft): ${msg}`);
						failSoftErrors.push(
							await recordFailSoftError(cwd, sessionId, {
								site: "ralplan-obstacle-dual-write",
								message: msg,
								skill: "ralplan",
							}),
						);
					}
				}
			}
			await markRalplanCompletionStep(cwd, sessionId, mutationId, "obstacle_ledger");
			const state = await writeWorkflowState(
				cwd,
				"ralplan",
				{
					active: true,
					current_phase: nextPhase(previousState?.current_phase, input.stage),
					run_id: runId,
					latest_artifact_path: artifact.path,
					pending_approval_path: pendingApprovalPath,
					...plannerStatePatch(plannerState),
					...progressPatch,
				},
				"pi ralplan write-artifact",
				{ sessionId, mutationId },
			);
			await markRalplanCompletionStep(cwd, sessionId, mutationId, "workflow_state");
			const completionProvenancePath = await writeRalplanCompletionProvenance({
				cwd,
				artifactPath: artifact.path,
				sessionId,
				runId,
				stage: input.stage,
				stageN: input.stageN,
				role: ralplanCompletionRole(input.stage),
				artifactSha256: artifact.sha256,
				mutationId,
				actor: "pi ralplan write-artifact",
				journalPath,
			});
			rollbackRemovablePaths.push(completionProvenancePath);
			await markRalplanCompletionStep(cwd, sessionId, mutationId, "completion_provenance");
			const status = await readRalplanStatus(cwd, sessionId, runId);
			await syncWorkflowActiveState(
				cwd,
				{
					skill: "ralplan",
					active: state.active,
					phase: state.current_phase,
					state_path: workflowStatePath(cwd, "ralplan", sessionId),
					hud: buildRalplanHud(status),
				},
				{ sessionId },
			);
			await markRalplanCompletionStep(cwd, sessionId, mutationId, "active_hud");
			await markRalplanCompletionStep(cwd, sessionId, mutationId, "commit");
			await commitRalplanCompletionJournal(cwd, sessionId, mutationId);
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
				journalPath,
				completionProvenancePath,
				...(verdict ? { verdict } : {}),
				...(failSoftErrors.length ? { failSoftErrors } : {}),
			};
		} catch (error) {
			await recordRalplanRollback({ cwd, sessionId, mutationId, paths: rollbackRemovablePaths, error });
			throw error;
		}
	});
}

function latestCriticPass(
	rows: readonly RalplanIndexRow[],
): { verdict: RalplanCriticVerdictKind; planRef: string } | undefined {
	let verdict: RalplanCriticVerdictKind | undefined;
	let planRef: string | undefined;
	let stageN = -1;
	for (const row of rows) {
		if (row.stage !== "critic" || !row.verdict || row.verdict.role !== "critic") continue;
		if (row.stage_n > stageN) {
			verdict = row.verdict.verdict;
			planRef = row.path;
			stageN = row.stage_n;
		}
	}
	return verdict !== undefined && planRef !== undefined ? { verdict, planRef } : undefined;
}

function latestCriticVerdict(rows: readonly RalplanIndexRow[]): RalplanCriticVerdictKind | undefined {
	return latestCriticPass(rows)?.verdict;
}

/**
 * Phase R-2 agreement check: does the obstacle ledger reflect the latest critic
 * verdict for the latest critic pass? Scoped to the latest pass's artifact
 * (`scope.planRef`) so stale active obstacles from EARLIER revision passes (R-1
 * never resolves obstacles) do not read as divergence. By construction R-1 writes
 * exactly the right obstacle (or none for APPROVE), so disagreement means a
 * dual-write bug or a corrupt ledger.
 */
function criticObstacleAgreement(
	pass: { verdict: RalplanCriticVerdictKind; planRef: string },
	ledger: RalplanObstacleLedger,
): { agree: boolean; reason?: string } {
	const obstacles = unresolvedRalplanObstacles(ledger, { scope: { planRef: pass.planRef } });
	if (pass.verdict === "approve") {
		if (obstacles.length > 0)
			return {
				agree: false,
				reason: `latest critic verdict is APPROVE but ${obstacles.length} unresolved obstacle(s) remain for ${pass.planRef}`,
			};
		return { agree: true };
	}
	const expectedKind = pass.verdict === "reject" ? "plan_rejected" : "revision_required";
	if (!obstacles.some((o) => o.kind === expectedKind))
		return {
			agree: false,
			reason: `latest critic verdict is ${pass.verdict.toUpperCase()} but no unresolved ${expectedKind} obstacle recorded for ${pass.planRef}`,
		};
	return { agree: true };
}

export async function approveRalplanPlan(
	cwd: string,
	options: {
		runId?: string;
		target?: RalplanApprovalTarget;
		approved?: boolean;
		note?: string;
		overrideCriticVerdict?: boolean;
		sessionId: string;
	},
): Promise<RalplanApproveResult> {
	const sessionId = options.sessionId;
	const target = options.target ?? "ultragoal";
	const approved = options.approved !== false;
	const status = await readRalplanStatus(cwd, sessionId, options.runId);
	if (!status.run_id)
		throw new Error(
			"cannot approve ralplan without a run_id: no artifacts have been persisted yet. Run the planner stage (`ralplan_run_agent` tool / `pi workflow ralplan write-artifact`) first, then run `pi workflow ralplan doctor` if the run still looks inconsistent.",
		);
	if (!status.pending_approval || !status.pending_approval_path) {
		throw new Error("cannot approve ralplan: no pending approval plan is available");
	}
	await readFile(status.pending_approval_path, "utf8");

	// Critic-verdict gate (R-2): refuse to approve a plan the latest critic explicitly
	// REJECTed, unless `overrideCriticVerdict` is set. ITERATE produces a soft warning
	// (the plan was not re-reviewed after the last revision). APPROVE and no-critic
	// runs proceed silently (backward compat). Rejections (approved === false) bypass
	// the gate entirely.
	const criticPass = latestCriticPass(status.rows);
	const criticVerdict = criticPass?.verdict;
	let criticVerdictOverridden = false;
	let approvalWarning: string | undefined;
	if (approved) {
		if (criticVerdict === "reject") {
			if (!options.overrideCriticVerdict) {
				throw new Error(
					"cannot approve ralplan: the latest critic verdict is REJECT. Revise and re-run the critic, or set overrideCriticVerdict to force approval.",
				);
			}
			criticVerdictOverridden = true;
		} else if (criticVerdict === "iterate") {
			approvalWarning =
				"latest critic verdict is ITERATE; the plan was not re-reviewed by the critic after the last revision.";
		}
	}

	// R-2 obstacle-ledger agreement (mirror of B-1): the R-1 dual-write should
	// keep the obstacle ledger in sync with the latest critic verdict for the
	// latest critic pass (scoped by planRef so stale earlier-pass obstacles do not
	// read as divergence). Divergence = a dual-write bug or a corrupt ledger.
	// Assert in dev/test, warn in production. Only checked when the ledger is
	// non-empty (a missing/empty ledger is the pre-R-1 / fail-soft case, not a
	// divergence) and a critic pass exists.
	if (criticPass) {
		const ledger = await readRalplanObstacleLedger(cwd, status.run_id, sessionId);
		if (ledger.obstacles.length > 0) {
			const agreement = criticObstacleAgreement(criticPass, ledger);
			if (!agreement.agree) {
				const msg = `ralplan critic/obstacle divergence for ${criticPass.planRef}: ${agreement.reason}`;
				if (process.env.NODE_ENV !== "production") throw new Error(msg);
				console.warn(msg);
			}
		}
	}
	const now = new Date().toISOString();
	const sourceLedger = await readRalplanObstacleLedger(cwd, status.run_id, sessionId);
	const carriedObstacles = unresolvedRalplanObstacles(sourceLedger).map((obstacle) => ({
		...obstacle,
		originSkill: "ralplan",
		originRef: status.run_id,
	}));
	let ralplanState: Record<string, unknown>;
	let targetState: Record<string, unknown> | undefined;
	let approvalFailSoftErrors: FailSoftError[] | undefined;
	if (approved && target !== "stop") {
		// Handoff branch: delegate the caller demote + callee promote + active-state
		// apply to `handoffWorkflow` (transaction journal + both-side receipts +
		// callee->caller->active-state write order). The ralplan approval metadata
		// travels in the caller patch; the callee gets the plan input.
		const targetSkill: WorkflowSkill = target;
		const result = await handoffWorkflow({
			cwd,
			caller: {
				skill: "ralplan",
				patch: {
					run_id: status.run_id,
					pending_approval_path: status.pending_approval_path,
					approved,
					approval_target: target,
					approval_note: options.note,
					approved_at: now,
				},
				sessionId,
			},
			callee: {
				skill: targetSkill,
				patch: {
					input: status.pending_approval_path,
					source_workflow: "ralplan",
					source_run_id: status.run_id,
					carried_obstacles: carriedObstacles,
				},
				sessionId,
			},
			command: "pi ralplan approve",
			sessionId,
		});
		ralplanState = result.callerState;
		targetState = result.calleeState;
		approvalFailSoftErrors = result.carriedObstacleFailures;
	} else {
		// No handoff target (stop / rejected): just deactivate ralplan.
		ralplanState = await writeWorkflowState(
			cwd,
			"ralplan",
			{
				active: false,
				current_phase: approved ? "approved" : "rejected",
				run_id: status.run_id,
				pending_approval_path: status.pending_approval_path,
				approved,
				approval_target: target,
				approval_note: options.note,
				approved_at: approved ? now : undefined,
				rejected_at: approved ? undefined : now,
			},
			"pi ralplan approve-reject",
			{ sessionId },
		);
		await syncWorkflowActiveState(
			cwd,
			{
				skill: "ralplan",
				active: false,
				phase: ralplanState.current_phase as string | undefined,
				state_path: workflowStatePath(cwd, "ralplan", sessionId),
			},
			{ sessionId },
		);
	}
	return {
		runId: status.run_id,
		approved,
		target,
		pendingApprovalPath: status.pending_approval_path,
		ralplanState,
		targetState,
		...(criticVerdict ? { critic_verdict: criticVerdict } : {}),
		...(criticVerdictOverridden ? { critic_verdict_overridden: true } : {}),
		...(approvalWarning ? { approval_warning: approvalWarning } : {}),
		...(approvalFailSoftErrors?.length ? { failSoftErrors: approvalFailSoftErrors } : {}),
	};
}

export async function doctorRalplan(cwd: string, sessionId: string, runId?: string): Promise<RalplanDoctorResult> {
	const status = await readRalplanStatus(cwd, sessionId, runId);
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
		try {
			const sidecar = JSON.parse(await readFile(ralplanCompletionProvenancePath(row.path), "utf8")) as unknown;
			if (!isPlainObject(sidecar)) problems.push(`completion provenance sidecar is invalid for ${row.path}`);
			else {
				if (sidecar.artifact_sha256 !== row.sha256)
					problems.push(`completion provenance hash mismatch for ${row.path}`);
				if (sidecar.stage !== row.stage || sidecar.stage_n !== row.stage_n)
					problems.push(`completion provenance stage mismatch for ${row.path}`);
			}
		} catch {
			warnings.push(`missing completion provenance sidecar for ${row.path}`);
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
		const pendingCriticVerdict = latestCriticVerdict(status.rows);
		if (pendingCriticVerdict === "reject") warnings.push("pending approval but the latest critic verdict is REJECT");
		else if (pendingCriticVerdict === "iterate")
			warnings.push(
				"pending approval but the latest critic verdict is ITERATE (not re-reviewed after last revision)",
			);
		// R-2 obstacle-ledger agreement warning (mirror of the approve dev-assert).
		// Doctor surfaces divergence (including an empty ledger against a blocker
		// verdict) as a warning rather than throwing.
		const pass = latestCriticPass(status.rows);
		if (pass && status.run_id) {
			const ledger = await readRalplanObstacleLedger(cwd, status.run_id, sessionId);
			if (ledger.obstacles.length === 0) {
				if (pass.verdict === "reject" || pass.verdict === "iterate")
					warnings.push(
						`latest critic verdict is ${pass.verdict.toUpperCase()} but the obstacle ledger is empty (dual-write may have failed or run predates R-1)`,
					);
			} else {
				const agreement = criticObstacleAgreement(pass, ledger);
				if (!agreement.agree) warnings.push(`critic/obstacle divergence: ${agreement.reason}`);
			}
		}
	}
	if (status.run_id) {
		const txDir = dirname(transactionJournalPath(cwd, sessionId, "probe"));
		try {
			const files = await readdir(txDir);
			for (const file of files.sort()) {
				if (!file.endsWith(".json")) continue;
				try {
					const journal = JSON.parse(await readFile(`${txDir}/${file}`, "utf8")) as unknown;
					if (!isPlainObject(journal) || journal.type !== "ralplan_completion" || journal.run_id !== status.run_id)
						continue;
					const steps = Array.isArray(journal.steps) ? journal.steps.filter(isPlainObject) : [];
					if (journal.status === "pending" && steps.some((step) => step.status === "done"))
						problems.push(`partial completion journal: ${file}`);
					else if (journal.status === "pending") warnings.push(`stale intent journal: ${file}`);
					else if (journal.status === "rolled_back") warnings.push(`rolled back ralplan completion: ${file}`);
					else if (journal.status !== "committed" && journal.status !== "complete")
						problems.push(`unknown transaction journal status in ${file}`);
				} catch (error) {
					const err = error as NodeJS.ErrnoException;
					problems.push(`invalid transaction journal ${file}: ${err.message}`);
				}
			}
		} catch {
			// No transaction directory yet.
		}
	}
	if (status.rows.length === 0) warnings.push("ralplan index is empty");
	return { ok: problems.length === 0, problems, warnings, status };
}
