import type { RalplanCriticVerdictKind, RalplanVerdict } from "#workflows/skills/ralplan/verdicts";

export type RalplanStage =
	| "pre-planner"
	| "planner"
	| "architect"
	| "critic"
	| "revision"
	| "adr"
	| "final"
	| "expert-stage";

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
	/** Parsed critic or architect verdict; omitted for stages without verdict evidence. */
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
	/** Parsed critic or architect verdict when the stage produced one. */
	verdict?: RalplanVerdict;
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
}

export interface RalplanDoctorResult {
	ok: boolean;
	problems: string[];
	warnings: string[];
	status: RalplanStatus;
}
