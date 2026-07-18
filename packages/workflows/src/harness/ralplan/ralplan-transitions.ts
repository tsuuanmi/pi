import { assertRalplanExplorerGatePassed } from "../ralplan/ralplan-gates.ts";
import { readRalplanStatus } from "../ralplan/ralplan-runtime.ts";
import type { ExpectedNextRole, RalplanSelectorState } from "../shared/expected-next-role.ts";
import { registerSkillTransitionTable } from "../shared/skill-registry.ts";

const RALPLAN_CLOSED_PHASES = new Set([
	"pending-approval",
	"approved",
	"handoff",
	"complete",
	"completed",
	"failed",
	"cancelled",
	"canceled",
	"inactive",
]);

function selectNextRalplanRole(state: RalplanSelectorState | undefined, runId: string): ExpectedNextRole | undefined {
	if (state?.current_phase && RALPLAN_CLOSED_PHASES.has(state.current_phase)) return undefined;
	const iterateCap = typeof state?.iterateCap === "number" && state.iterateCap > 0 ? state.iterateCap : 5;
	const expertCap = typeof state?.expertCap === "number" && state.expertCap > 0 ? state.expertCap : 3;
	const expertCount = typeof state?.expertCount === "number" ? state.expertCount : 0;
	if (
		state?.current_phase === "expert-stage" ||
		state?.expertEscalation === true ||
		(typeof state?.iterateCount === "number" && state.iterateCount >= iterateCap)
	) {
		if (expertCount >= expertCap) return undefined;
		return { skill: "ralplan", stage: "expert-stage", role: "expert", owner: "ralplan_run_agent", runId };
	}

	const explorer = state?.explorerGate;
	if (explorer) {
		if (explorer.status === "human_blocked") {
			if (expertCount >= expertCap) return undefined;
			return {
				skill: "ralplan",
				stage: "expert-stage",
				role: "expert",
				owner: "ralplan_run_agent",
				runId,
			};
		}
		if (explorer.status !== "passed") {
			return { skill: "ralplan", stage: "pre-planner", role: "explorer", owner: "ralplan_run_agent", runId };
		}
	}

	const latest = state?.latest;
	if (!latest) {
		return { skill: "ralplan", stage: "planner", role: "planner", owner: "ralplan_run_agent", runId };
	}
	switch (latest.stage) {
		case "planner":
		case "revision":
			return { skill: "ralplan", stage: "architect", role: "architect", owner: "ralplan_run_agent", runId };
		case "architect":
			return { skill: "ralplan", stage: "critic", role: "critic", owner: "ralplan_run_agent", runId };
		case "critic": {
			const v = latest.verdict;
			if (v?.role === "critic") {
				if (v.verdict === "approve") return undefined;
				if (v.verdict === "iterate" || v.verdict === "reject") {
					return { skill: "ralplan", stage: "revision", role: "planner", owner: "ralplan_run_agent", runId };
				}
			}
			return { skill: "ralplan", stage: "critic", role: "critic", owner: "ralplan_run_agent", runId };
		}
		case "adr":
		case "final":
			return undefined;
		default:
			return undefined;
	}
}

registerSkillTransitionTable<RalplanSelectorState>({
	skill: "ralplan",
	terminalDetectors: [
		{
			id: "ralplan-final-artifact-receipt",
			kind: "receipt",
			description: "Terminal when the harness observes a fresh ralplan final-stage artifact receipt.",
		},
	],
	gateValidators: [
		{
			id: "ralplan-explorer-doctor-approval",
			description: "Fail-closed explorer, doctor, critic approval, and final-plan approval gates.",
			validate: async (context) => {
				if (!context.cwd || !context.sessionId) return { ok: true, blockers: [] };
				const state = context.state as Record<string, unknown> | undefined;
				if (!state || state.active === false) return { ok: true, blockers: [] };
				const runId =
					typeof context.runId === "string"
						? context.runId
						: typeof state.run_id === "string"
							? state.run_id
							: undefined;
				if (!runId) return { ok: true, blockers: [] };
				try {
					await assertRalplanExplorerGatePassed(context.cwd, runId, context.sessionId);
				} catch {
					return { ok: false, blockers: ["explorer-gate-not-passed"] };
				}
				const status = await readRalplanStatus(context.cwd, context.sessionId, runId);
				if (status.pending_approval) return { ok: false, blockers: ["pending-approval-not-approved"] };
				return { ok: true, blockers: [] };
			},
		},
	],
	selectNextRole: ({ state, runId }) => {
		const record =
			state && typeof state === "object" && !Array.isArray(state) ? (state as Record<string, unknown>) : {};
		const resolvedRunId = runId ?? (typeof record.run_id === "string" ? record.run_id : "unknown");
		return selectNextRalplanRole(state, resolvedRunId);
	},
});
