import type { ExpectedNextRole } from "#workflows/harness/shared/orchestration/expected-next-role";
import type { RalplanOrchestrationSnapshot } from "#workflows/skills/ralplan/ralplan-orchestration-snapshot";

export type RalplanExpectedAction =
	| { kind: "spawn"; expected: ExpectedNextRole; reason: string }
	| { kind: "closed"; reason: string }
	| { kind: "blocked"; reason: string }
	| { kind: "no-action"; reason: string };

const CLOSED_PHASES = new Set([
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

function spawn(
	snapshot: RalplanOrchestrationSnapshot,
	stage: string,
	role: string,
	reason: string,
): RalplanExpectedAction {
	return {
		kind: "spawn",
		reason,
		expected: { skill: "ralplan", stage, role, owner: "ralplan_run_agent", runId: snapshot.runId },
	};
}

export function selectExpectedRalplanAction(snapshot: RalplanOrchestrationSnapshot): RalplanExpectedAction {
	if (snapshot.version !== 1) return { kind: "blocked", reason: "unsupported snapshot schema" };
	if (!snapshot.runId) return { kind: "blocked", reason: "missing run id" };
	if (snapshot.index.invalidLines.length > 0) return { kind: "blocked", reason: "invalid influential index lines" };
	if (snapshot.artifactHealth.health !== "complete")
		return { kind: "blocked", reason: "artifact health is not complete" };
	if (
		snapshot.transactionJournal.health === "partial_completion" ||
		snapshot.transactionJournal.health === "stale_intent"
	) {
		return { kind: "blocked", reason: snapshot.transactionJournal.health };
	}
	if (snapshot.phase && CLOSED_PHASES.has(snapshot.phase))
		return { kind: "closed", reason: `phase ${snapshot.phase}` };
	const expertCap =
		typeof snapshot.state?.expert_cap === "number" && snapshot.state.expert_cap > 0 ? snapshot.state.expert_cap : 3;
	const expertCount = typeof snapshot.state?.expert_count === "number" ? snapshot.state.expert_count : 0;
	const iterateCap =
		typeof snapshot.state?.iterate_cap === "number" && snapshot.state.iterate_cap > 0
			? snapshot.state.iterate_cap
			: 5;
	const iterateCount = typeof snapshot.state?.iterate_count === "number" ? snapshot.state.iterate_count : 0;
	if (snapshot.phase === "expert-stage" || snapshot.state?.expert_escalation === true || iterateCount >= iterateCap) {
		return expertCount >= expertCap
			? { kind: "closed", reason: "expert cap reached" }
			: spawn(snapshot, "expert-stage", "expert", "expert escalation");
	}
	const latest = snapshot.index.rows.at(-1);
	const gate = snapshot.explorerGate;
	if (!latest) {
		if (!gate) return spawn(snapshot, "pre-planner", "explorer", "missing explorer gate");
		if (gate.status === "invalid") return { kind: "blocked", reason: gate.reason };
		if (gate.status === "human_blocked") {
			return expertCount >= expertCap
				? { kind: "closed", reason: "expert cap reached" }
				: spawn(snapshot, "expert-stage", "expert", "explorer human blocked");
		}
		if (gate.status !== "passed") return spawn(snapshot, "pre-planner", "explorer", `explorer gate ${gate.status}`);
		return spawn(snapshot, "planner", "planner", "no plan artifact yet");
	}
	switch (latest.stage) {
		case "planner":
		case "revision":
			return spawn(snapshot, "architect", "architect", `latest stage ${latest.stage}`);
		case "architect":
			return spawn(snapshot, "critic", "critic", "architect completed");
		case "critic":
			if (latest.verdict?.role === "critic" && latest.verdict.verdict === "approve")
				return { kind: "closed", reason: "critic approved" };
			if (
				latest.verdict?.role === "critic" &&
				(latest.verdict.verdict === "iterate" || latest.verdict.verdict === "reject")
			) {
				return spawn(snapshot, "revision", "planner", `critic ${latest.verdict.verdict}`);
			}
			return spawn(snapshot, "critic", "critic", "critic verdict missing or ambiguous");
		case "adr":
		case "final":
			return { kind: "closed", reason: `latest stage ${latest.stage}` };
		default:
			return { kind: "blocked", reason: `unknown latest stage ${latest.stage}` };
	}
}
