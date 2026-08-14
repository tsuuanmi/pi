import {
	evidenceMatrixPasses,
	reviewReportBlocks,
	validateEvidenceMatrixVerdict,
	validateReviewReportVerdict,
} from "#workflows/policy/gate-verdicts";
import { assertSafeId } from "#workflows/skills/team/ids";
import {
	teamConfigPath,
	teamGateArtifactPath,
	teamTaskGateArtifactPath,
	teamTaskPath,
} from "#workflows/skills/team/paths";
import { readTeamSnapshot, syncTeamState } from "#workflows/skills/team/state";
import { appendTeamEvent, readJsonObject, readTeamConfig, resolveTeamId } from "#workflows/skills/team/team-store";
import type {
	TeamCompletionGate,
	TeamConfig,
	TeamGateEscalation,
	TeamReviewGate,
	TeamSnapshot,
	TeamTask,
} from "#workflows/skills/team/types";
import { parseTeamTask } from "#workflows/skills/team/validation";
import { nowIso, writeJsonAtomic } from "#workflows/state/state-writer";

function parseRecorder(value: string): string {
	if (!value || value.trim() !== value) throw new Error("recordedBy must be a non-empty, trimmed string");
	return value;
}

export function passingReviewGate(task: TeamTask): boolean {
	return task.review_gate?.gate === "review" && task.review_gate.status === "passed";
}

export async function writeReviewGateBlock(
	cwd: string,
	teamId: string,
	task: TeamTask,
	sessionId: string,
	reason: string,
): Promise<TeamTask> {
	const attempt = (task.review_gate?.attempt ?? task.gate_escalation?.attempt ?? 0) + 1;
	const status = attempt >= 2 ? "human_blocked" : "retry_requested";
	const now = nowIso();
	const next: TeamTask = {
		...task,
		status: status === "human_blocked" ? "blocked" : task.status,
		review_gate: { gate: "review", status, attempt, updated_at: now },
		gate_escalation: { gate: "review", status, attempt, reason, updated_at: now },
		updated_at: now,
	};
	await writeJsonAtomic(teamTaskPath(cwd, teamId, next.id, sessionId), { ...next }, { cwd });
	await appendTeamEvent(
		cwd,
		teamId,
		{ type: "team_review_gate_blocked", task_id: next.id, message: reason, data: { status, attempt } },
		sessionId,
	);
	return next;
}

export async function recordTeamReviewGateArtifact(
	cwd: string,
	input: { teamId?: string; taskId: string; reviewReport: unknown; recordedBy: string },
	sessionId: string,
): Promise<TeamReviewGate> {
	const teamId = await resolveTeamId(cwd, sessionId, input.teamId);
	assertSafeId("task_id", input.taskId);
	const raw = await readJsonObject(teamTaskPath(cwd, teamId, input.taskId, sessionId));
	if (!raw) throw new Error(`unknown team task: ${input.taskId}`);
	const current = parseTeamTask(raw, input.taskId);
	const verdict = validateReviewReportVerdict(input.reviewReport);
	const recordedBy = parseRecorder(input.recordedBy);
	const attempt = (current.review_gate?.attempt ?? 0) + 1;
	const artifactPath = teamTaskGateArtifactPath(cwd, teamId, current.id, "review", attempt, sessionId);
	await writeJsonAtomic(
		artifactPath,
		{
			artifact_type: "review_report",
			team_id: teamId,
			task_id: current.id,
			gate: "review",
			attempt,
			recorded_by: recordedBy,
			recorded_at: nowIso(),
			...verdict,
		},
		{ cwd },
	);
	const now = nowIso();
	const blocks = reviewReportBlocks(verdict);
	const escalated = blocks && attempt >= 2;
	const gate: TeamReviewGate = {
		gate: "review",
		status: blocks ? (escalated ? "human_blocked" : "blocked") : "passed",
		attempt,
		artifact_path: artifactPath,
		max_severity: verdict.max_severity,
		needs_changes: verdict.needs_changes,
		summary: verdict.summary,
		updated_at: now,
	};
	const next: TeamTask = {
		...current,
		review_gate: gate,
		gate_escalation: blocks
			? {
					gate: "review",
					status: escalated ? "human_blocked" : "retry_requested",
					attempt,
					reason: `review blocked: severity=${verdict.max_severity}; needs_changes=${verdict.needs_changes}`,
					updated_at: now,
				}
			: undefined,
		updated_at: now,
	};
	await writeJsonAtomic(teamTaskPath(cwd, teamId, next.id, sessionId), { ...next }, { cwd });
	await appendTeamEvent(
		cwd,
		teamId,
		{
			type: "team_review_gate_recorded",
			task_id: next.id,
			message: gate.status,
			data: { status: gate.status, attempt, artifact_path: artifactPath, max_severity: verdict.max_severity },
		},
		sessionId,
	);
	await syncTeamState(cwd, await readTeamSnapshot(cwd, sessionId, teamId), sessionId);
	return gate;
}

function passingCompletionGate(config: TeamConfig): boolean {
	return config.completion_gate?.gate === "completion" && config.completion_gate.status === "passed";
}

async function writeCompletionGateBlock(
	cwd: string,
	teamId: string,
	config: TeamConfig,
	sessionId: string,
	reason: string,
): Promise<TeamConfig> {
	const attempt = (config.completion_gate?.attempt ?? config.gate_escalation?.attempt ?? 0) + 1;
	const status = attempt >= 2 ? "human_blocked" : "retry_requested";
	const now = nowIso();
	const gate: TeamCompletionGate = {
		gate: "completion",
		status,
		attempt,
		updated_at: now,
	};
	const gateEscalation: TeamGateEscalation = {
		gate: "completion",
		status,
		attempt,
		reason,
		updated_at: now,
	};
	const next: TeamConfig = { ...config, completion_gate: gate, gate_escalation: gateEscalation, updated_at: now };
	await writeJsonAtomic(teamConfigPath(cwd, teamId, sessionId), { ...next }, { cwd });
	await appendTeamEvent(
		cwd,
		teamId,
		{
			type: "team_completion_gate_blocked",
			message: reason,
			data: { gate: "completion", status, attempt },
		},
		sessionId,
	);
	return next;
}

export async function recordTeamCompletionGateArtifact(
	cwd: string,
	input: { teamId?: string; evidenceMatrix: unknown; recordedBy: string },
	sessionId: string,
): Promise<TeamCompletionGate> {
	const teamId = await resolveTeamId(cwd, sessionId, input.teamId);
	const config = await readTeamConfig(cwd, teamId, sessionId);
	if (!config) throw new Error(`unknown team: ${teamId}`);
	const verdict = validateEvidenceMatrixVerdict(input.evidenceMatrix);
	const recordedBy = parseRecorder(input.recordedBy);
	const attempt = (config.completion_gate?.attempt ?? 0) + 1;
	const artifactPath = teamGateArtifactPath(cwd, teamId, "completion", attempt, sessionId);
	await writeJsonAtomic(
		artifactPath,
		{
			artifact_type: "evidence_matrix",
			team_id: teamId,
			gate: "completion",
			attempt,
			recorded_by: recordedBy,
			recorded_at: nowIso(),
			...verdict,
		},
		{ cwd },
	);
	const now = nowIso();
	const passed = evidenceMatrixPasses(verdict);
	const escalated = !passed && (verdict.escalation === "human_blocked" || attempt >= 2);
	const gate: TeamCompletionGate = {
		gate: "completion",
		status: passed ? "passed" : escalated ? "human_blocked" : "blocked",
		attempt,
		artifact_path: artifactPath,
		ship_decision: verdict.ship_decision,
		escalation: verdict.escalation,
		summary: verdict.summary,
		updated_at: now,
	};
	const next: TeamConfig = {
		...config,
		completion_gate: gate,
		gate_escalation: passed
			? undefined
			: {
					gate: "completion",
					status: escalated ? "human_blocked" : "retry_requested",
					attempt,
					reason: `completion blocked: ship_decision=${verdict.ship_decision}; escalation=${verdict.escalation}`,
					updated_at: now,
				},
		updated_at: now,
	};
	await writeJsonAtomic(teamConfigPath(cwd, teamId, sessionId), { ...next }, { cwd });
	await appendTeamEvent(
		cwd,
		teamId,
		{
			type: "team_completion_gate_recorded",
			message: gate.status,
			data: {
				gate: "completion",
				status: gate.status,
				attempt,
				artifact_path: artifactPath,
				ship_decision: verdict.ship_decision,
				escalation: verdict.escalation,
			},
		},
		sessionId,
	);
	await syncTeamState(cwd, await readTeamSnapshot(cwd, sessionId, teamId), sessionId);
	return gate;
}

export async function completeTeam(
	cwd: string,
	input: { teamId?: string; phase?: "complete" | "failed" | "cancelled"; summary?: string },
	sessionId: string,
): Promise<TeamSnapshot> {
	const teamId = await resolveTeamId(cwd, sessionId, input.teamId);
	const config = await readTeamConfig(cwd, teamId, sessionId);
	if (!config) throw new Error(`unknown team: ${teamId}`);
	const phase = input.phase ?? "complete";
	if (phase === "complete" && !passingCompletionGate(config)) {
		const reason = "team completion requires a passing prover evidence_matrix";
		const blocked = await writeCompletionGateBlock(cwd, teamId, config, sessionId, reason);
		await syncTeamState(cwd, await readTeamSnapshot(cwd, sessionId, teamId), sessionId);
		throw new Error(`${reason}; completion gate ${blocked.completion_gate?.status}`);
	}
	const next = { ...config, phase, updated_at: nowIso() };
	await writeJsonAtomic(teamConfigPath(cwd, teamId, sessionId), next, { cwd });
	await appendTeamEvent(
		cwd,
		teamId,
		{ type: "team_closed", message: input.summary ?? phase, data: { phase } },
		sessionId,
	);
	const snapshot = await readTeamSnapshot(cwd, sessionId, teamId);
	await syncTeamState(cwd, snapshot, sessionId);
	return snapshot;
}
