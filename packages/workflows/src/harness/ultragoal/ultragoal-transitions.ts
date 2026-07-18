import type { ExpectedNextRole } from "../shared/orchestration/expected-next-role.ts";
import { registerSkillTransitionTable, type SkillTransitionContext } from "../shared/registry/skill-registry.ts";
import { chooseReceiptKind, readUltragoalLedger, validateCompletionReceipt } from "./ultragoal-receipt.ts";
import { getUltragoalStatus, readUltragoalPlan } from "./ultragoal-runtime.ts";

interface UltragoalSelectorGoal {
	id: string;
	status: string;
}

interface UltragoalSelectorState {
	current_goal_id?: string;
	goals?: UltragoalSelectorGoal[];
}

function selectNextUltragoalRole(state: UltragoalSelectorState | undefined): ExpectedNextRole | undefined {
	const goals = Array.isArray(state?.goals) ? state.goals : [];
	const active = goals.find((goal) => goal.status === "active");
	const pending = goals.find((goal) => goal.status === "pending");
	const goalId = active?.id ?? state?.current_goal_id ?? pending?.id;
	if (!goalId) return undefined;
	return {
		skill: "ultragoal",
		stage: "goal-worker",
		role: "worker",
		owner: "ultragoal_spawn_goal_agent",
		taskId: goalId,
	};
}

async function validateUltragoalGates(context: SkillTransitionContext<UltragoalSelectorState>): Promise<{
	ok: boolean;
	blockers: string[];
}> {
	const cwd = context.cwd;
	if (!cwd) return { ok: false, blockers: ["ultragoal-gate-read-error:missing-workspace"] };
	const sessionId = context.sessionId;
	if (!sessionId) return { ok: false, blockers: ["ultragoal-gate-read-error:missing-session"] };
	const status = await getUltragoalStatus(cwd, sessionId);
	if (!status.exists) return { ok: true, blockers: [] };
	const blockers: string[] = [];
	const requiredGoals = status.goals.filter((goal) => goal.status !== "superseded");
	if (status.status === "complete") {
		const plan = await readUltragoalPlan(cwd, sessionId);
		if (!plan) return { ok: false, blockers: ["ultragoal-plan-missing"] };
		const incomplete = requiredGoals.filter((goal) => goal.status !== "complete");
		if (incomplete.length > 0)
			blockers.push(`ultragoal-incomplete-goals:${incomplete.map((goal) => goal.id).join(",")}`);
		const ledger = await readUltragoalLedger(cwd, sessionId);
		for (const goal of requiredGoals.filter((item) => item.status === "complete")) {
			if (!goal.completionVerification) {
				blockers.push(`ultragoal-receipt-missing:${goal.id}`);
				continue;
			}
			const diagnostic = validateCompletionReceipt({
				plan,
				ledger,
				goal,
				receiptKind: chooseReceiptKind(plan, goal, "complete"),
			});
			if (diagnostic.state !== "active_verified_complete") blockers.push(diagnostic.state);
		}
	}
	const unclassifiedBlocked = status.goals.filter((goal) => goal.status === "blocked" || goal.status === "failed");
	if (unclassifiedBlocked.length > 0)
		blockers.push(`ultragoal-human-blocked:${unclassifiedBlocked.map((goal) => goal.id).join(",")}`);
	return { ok: blockers.length === 0, blockers };
}

registerSkillTransitionTable<UltragoalSelectorState>({
	skill: "ultragoal",
	terminalDetectors: [
		{
			id: "ultragoal-complete-checkpoint-receipt",
			kind: "receipt",
			description: "Terminal when the harness observes a fresh complete ultragoal checkpoint receipt.",
		},
	],
	gateValidators: [
		{
			id: "ultragoal-guard-and-blocker-classification",
			description: "Fail-closed completion guard and blocker-classification gates.",
			validate: validateUltragoalGates,
		},
	],
	selectNextRole: ({ state }) => selectNextUltragoalRole(state),
});
