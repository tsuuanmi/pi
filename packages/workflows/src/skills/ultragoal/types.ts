import type { UltragoalGoal, UltragoalGoalStatus, UltragoalPlan } from "#workflows/skills/ultragoal/receipt";

export interface UltragoalCheckpointSummary {
	checkpointId: string;
	goalId: string;
	status: UltragoalGoalStatus;
	createdAt: string;
	path: string;
	planHash: string;
	restoreWarning: string;
}

export interface UltragoalStatus {
	exists: boolean;
	status: "missing" | "pending" | "active" | "complete" | "blocked" | "failed";
	mainGoal?: UltragoalPlan["mainGoal"];
	currentGoal?: UltragoalGoal;
	lastCheckpoint?: UltragoalCheckpointSummary;
	planHash?: string;
	counts: Record<UltragoalGoalStatus, number>;
	goals: UltragoalGoal[];
	brief_path: string;
	goals_path: string;
	ledger_path: string;
}

export type UltragoalBlockerClassification = "human_blocked" | "resolvable";
