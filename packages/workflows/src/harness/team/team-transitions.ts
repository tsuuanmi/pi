import type { ExpectedNextRole, TeamSelectorSnapshot } from "../shared/orchestration/expected-next-role.ts";
import { registerSkillTransitionTable, type SkillTransitionContext } from "../shared/registry/skill-registry.ts";
import { readTeamCompact, readTeamSnapshot, type TeamSnapshot } from "./team-runtime.ts";

function selectNextTeamRole(snapshot: TeamSelectorSnapshot | undefined): ExpectedNextRole | undefined {
	if (!snapshot?.team_id) return undefined;
	const inProgress = snapshot.tasks.filter((task) => task.status === "in_progress");
	const pool = inProgress.length > 0 ? inProgress : snapshot.tasks.filter((task) => task.status === "pending");
	if (pool.length === 0) return undefined;
	const next = pool.slice().sort((a, b) => a.id.localeCompare(b.id))[0];
	if (!next) return undefined;
	return {
		skill: "team",
		stage: "task-worker",
		role: "worker",
		owner: "team_spawn_task_agent",
		teamId: snapshot.team_id,
		taskId: next.id,
	};
}

function missingCompletedTaskReviewBlockers(snapshot: TeamSnapshot): string[] {
	return snapshot.tasks
		.filter((task) => task.status === "completed" && task.review_gate?.status !== "passed")
		.map((task) => `team-review-gate-missing:${task.id}`);
}

function completionGatePassed(compact: Record<string, unknown>): boolean {
	const gate = compact.completion_gate;
	return Boolean(
		gate && typeof gate === "object" && !Array.isArray(gate) && (gate as { passed?: unknown }).passed === true,
	);
}

async function validateTeamGates(context: SkillTransitionContext<TeamSelectorSnapshot>): Promise<{
	ok: boolean;
	blockers: string[];
}> {
	const cwd = context.cwd;
	if (!cwd) return { ok: false, blockers: ["team-gate-read-error:missing-workspace"] };
	const sessionId = context.sessionId;
	if (!sessionId) return { ok: false, blockers: ["team-gate-read-error:missing-session"] };
	const teamId = context.state?.team_id;
	const snapshot = await readTeamSnapshot(cwd, sessionId, teamId);
	const blockers = missingCompletedTaskReviewBlockers(snapshot);
	if (snapshot.phase === "complete") {
		const compact = await readTeamCompact(cwd, sessionId, teamId);
		if (!completionGatePassed(compact)) blockers.push("team-completion-gate-missing");
	}
	return { ok: blockers.length === 0, blockers };
}

registerSkillTransitionTable<TeamSelectorSnapshot>({
	skill: "team",
	terminalDetectors: [
		{
			id: "team-completion-state-or-gate",
			kind: "state",
			description: "Terminal when the harness observes team completion state and completion gate evidence.",
		},
	],
	gateValidators: [
		{
			id: "team-review-and-completion-gates",
			description: "Fail-closed review-report and completion evidence-matrix gates.",
			validate: validateTeamGates,
		},
	],
	selectNextRole: ({ state }) => selectNextTeamRole(state),
});
