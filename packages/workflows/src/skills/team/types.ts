import type { EvidenceMatrixVerdict, GateEscalation, ReviewReportVerdict } from "#workflows/policy/gate-verdicts";
import type { TeamExecutionStatus } from "#workflows/skills/team/status-mapper";

export type TeamPhase = "starting" | "running" | "awaiting_integration" | "complete" | "failed" | "cancelled";
export type TeamTaskStatus = "pending" | "blocked" | "in_progress" | "completed" | "failed";

export interface TeamWorker {
	id: string;
	name: string;
	role: string;
	status: "idle" | "working" | "blocked" | "done" | "failed";
	assigned_tasks: string[];
	updated_at: string;
}

export interface TeamConfig {
	team_id: string;
	display_name: string;
	task: string;
	phase: TeamPhase;
	workers: TeamWorker[];
	completion_gate?: TeamCompletionGate;
	gate_escalation?: TeamGateEscalation;
	created_at: string;
	updated_at: string;
}

export interface TeamGateEscalation {
	gate: "completion";
	status: "retry_requested" | "human_blocked";
	attempt: number;
	reason: string;
	updated_at: string;
}

export interface TeamCompletionGate {
	gate: "completion";
	status: "passed" | "blocked" | "retry_requested" | "human_blocked";
	attempt: number;
	artifact_path?: string;
	ship_decision?: EvidenceMatrixVerdict["ship_decision"];
	escalation?: GateEscalation;
	summary?: string;
	updated_at: string;
}

export interface TeamTaskExecution {
	status: TeamExecutionStatus;
	updated_at: string;
	receipt_ids: string[];
	error?: string;
}

export interface TeamTask {
	id: string;
	title: string;
	description: string;
	status: TeamTaskStatus;
	owner?: string;
	assignee?: string;
	depends_on?: string[];
	blocked_by?: string[];
	review_gate?: TeamReviewGate;
	gate_escalation?: TeamTaskGateEscalation;
	completion_evidence?: TeamCompletionEvidence;
	execution?: TeamTaskExecution;
	version: number;
	created_at: string;
	updated_at: string;
	completed_at?: string;
}

export interface TeamReviewGate {
	gate: "review";
	status: "passed" | "blocked" | "retry_requested" | "human_blocked";
	attempt: number;
	artifact_path?: string;
	max_severity?: ReviewReportVerdict["max_severity"];
	needs_changes?: boolean;
	summary?: string;
	updated_at: string;
}

export interface TeamTaskGateEscalation {
	gate: "review";
	status: "retry_requested" | "human_blocked";
	attempt: number;
	reason: string;
	updated_at: string;
}

export interface TeamCompletionEvidence {
	summary: string;
	files?: string[];
	verification?: string[];
	recorded_by: string;
	recorded_at: string;
}

export interface TeamSnapshot {
	team_id?: string;
	phase: TeamPhase | "missing";
	state_dir?: string;
	task_total: number;
	task_counts: Record<TeamTaskStatus, number>;
	workers: TeamWorker[];
	tasks: TeamTask[];
	completion_gate?: TeamCompletionGate;
	updated_at: string;
}
