import { join } from "node:path";

export type WorkflowSkill = "deep-interview" | "ralplan" | "team" | "ultragoal";
export type RalplanStage = "planner" | "architect" | "critic" | "revision" | "adr" | "final";

export function piWorkflowRoot(cwd: string): string {
	return join(cwd, ".pi", "workflows");
}

export function workflowStatePath(cwd: string, skill: WorkflowSkill): string {
	return join(piWorkflowRoot(cwd), skill, "state.json");
}

export function workflowActiveStatePath(cwd: string): string {
	return join(piWorkflowRoot(cwd), "active-state.json");
}

export function piSpecsDir(cwd: string): string {
	return join(cwd, ".pi", "specs");
}

export function deepInterviewSpecPath(cwd: string, slug: string): string {
	return join(piSpecsDir(cwd), `deep-interview-${slug}.md`);
}

export function deepInterviewIndexPath(cwd: string): string {
	return join(piSpecsDir(cwd), "deep-interview-index.jsonl");
}

export function piPlansDir(cwd: string): string {
	return join(cwd, ".pi", "plans");
}

export function ralplanRootDir(cwd: string): string {
	return join(piPlansDir(cwd), "ralplan");
}

export function ralplanRunDir(cwd: string, runId: string): string {
	return join(ralplanRootDir(cwd), runId);
}

export function ralplanIndexPath(cwd: string, runId: string): string {
	return join(ralplanRunDir(cwd, runId), "index.jsonl");
}

export function ralplanStageArtifactPath(cwd: string, runId: string, stageN: number, stage: RalplanStage): string {
	return join(ralplanRunDir(cwd, runId), `stage-${stageN.toString().padStart(2, "0")}-${stage}.md`);
}

export function ralplanPendingApprovalPath(cwd: string, runId: string): string {
	return join(ralplanRunDir(cwd, runId), "pending-approval.md");
}

export function ultragoalDir(cwd: string): string {
	return join(cwd, ".pi", "ultragoal");
}

export function ultragoalBriefPath(cwd: string): string {
	return join(ultragoalDir(cwd), "brief.md");
}

export function ultragoalGoalsPath(cwd: string): string {
	return join(ultragoalDir(cwd), "goals.json");
}

export function ultragoalLedgerPath(cwd: string): string {
	return join(ultragoalDir(cwd), "ledger.jsonl");
}

export function teamDir(cwd: string): string {
	return join(cwd, ".pi", "team");
}

export function teamRunDir(cwd: string, teamId: string): string {
	return join(teamDir(cwd), teamId);
}

export function teamConfigPath(cwd: string, teamId: string): string {
	return join(teamRunDir(cwd, teamId), "config.json");
}

export function teamTasksDir(cwd: string, teamId: string): string {
	return join(teamRunDir(cwd, teamId), "tasks");
}

export function teamTaskPath(cwd: string, teamId: string, taskId: string): string {
	return join(teamTasksDir(cwd, teamId), `${taskId}.json`);
}

export function teamEventsPath(cwd: string, teamId: string): string {
	return join(teamRunDir(cwd, teamId), "events.jsonl");
}

export function teamMailboxPath(cwd: string, teamId: string, recipient: string): string {
	return join(teamRunDir(cwd, teamId), "mailbox", `${recipient}.jsonl`);
}
