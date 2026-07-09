export interface ExpectedNextRole {
	skill: "ralplan" | "team";
	stage: string;
	role: string;
	owner: string;
	runId?: string;
	teamId?: string;
	taskId?: string;
	gate?: string;
	attempt?: number;
}

export function describeExpectedNextRole(expected: ExpectedNextRole): string {
	const scope = [
		`skill=${expected.skill}`,
		`stage=${expected.stage}`,
		`role=${expected.role}`,
		`owner=${expected.owner}`,
		expected.runId ? `run=${expected.runId}` : undefined,
		expected.teamId ? `team=${expected.teamId}` : undefined,
		expected.taskId ? `task=${expected.taskId}` : undefined,
		expected.gate ? `gate=${expected.gate}` : undefined,
		expected.attempt !== undefined ? `attempt=${expected.attempt}` : undefined,
	].filter(Boolean);
	return scope.join("; ");
}

export function assertExpectedNextRole(
	expected: ExpectedNextRole,
	actual: {
		skill: string;
		stage: string;
		role: string;
		owner?: string;
		runId?: string;
		teamId?: string;
		taskId?: string;
	},
): void {
	const mismatches: string[] = [];
	if (actual.skill !== expected.skill) mismatches.push(`skill ${actual.skill} != ${expected.skill}`);
	if (actual.stage !== expected.stage) mismatches.push(`stage ${actual.stage} != ${expected.stage}`);
	if (actual.role !== expected.role) mismatches.push(`role ${actual.role} != ${expected.role}`);
	if (actual.owner !== undefined && actual.owner !== expected.owner)
		mismatches.push(`owner ${actual.owner} != ${expected.owner}`);
	if (expected.runId !== undefined && actual.runId !== undefined && actual.runId !== expected.runId)
		mismatches.push(`run ${actual.runId} != ${expected.runId}`);
	if (expected.teamId !== undefined && actual.teamId !== expected.teamId)
		mismatches.push(`team ${actual.teamId} != ${expected.teamId}`);
	if (expected.taskId !== undefined && actual.taskId !== expected.taskId)
		mismatches.push(`task ${actual.taskId} != ${expected.taskId}`);
	if (mismatches.length > 0) {
		throw new Error(
			`off-script spawn refused: ${mismatches.join(", ")}; expected ${describeExpectedNextRole(expected)}`,
		);
	}
}

// ---------------------------------------------------------------------------
// Deterministic state-driven selectors (Slice 2)
//
// Pure functions: callers read workflow state and pass it in. The selector
// returns exactly one legal ExpectedNextRole, or undefined when no legal spawn
// remains (workflow closed / awaiting approval / no actionable task). These
// never perform I/O so they can be unit-tested in isolation.
// ---------------------------------------------------------------------------

/** Ralplan verdict slice accepted by the selector (architect or critic). */
export interface RalplanSelectorVerdict {
	role: "architect" | "critic";
	/** architect clarity. */
	clarity?: "clear" | "watch" | "block";
	/** architect recommendation. */
	recommendation?: "approve" | "comment" | "request_changes";
	/** critic verdict. */
	verdict?: "approve" | "iterate" | "reject";
}

/** Latest ralplan index row slice used by the selector. */
export interface RalplanSelectorLatest {
	stage: string;
	verdict?: RalplanSelectorVerdict;
}

/** Ralplan state slice accepted by the selector. */
export interface RalplanSelectorState {
	current_phase?: string;
	latest?: RalplanSelectorLatest;
	/** Pre-planner explorer gate status slice ("passed" | "retry_requested" | "human_blocked" | "missing"). */
	explorerGate?: { status: string };
}

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

/**
 * Compute the one legal next ralplan role spawn from state. Returns undefined
 * when the workflow is closed/awaiting approval (no legal role spawn remains).
 *
 * Progression (driven by the explorer pre-planner gate, the latest written
 * artifact, and the critic verdict; the architect verdict does not branch the
 * stage flow, only the critic verdict does):
 *   explorer gate not passed (missing/retry) -> pre-planner/explorer (blocks all role spawns)
 *   explorer gate human_blocked              -> undefined (escalation; no legal spawn)
 *   none / explorer passed                   -> planner
 *   planner                                  -> architect
 *   revision                                 -> architect (re-review)
 *   architect                                -> critic (always; manifest has no architect->revision)
 *   critic                                    -> revision (iterate/reject), undefined (approve), else critic
 *   adr / final                               -> undefined
 */
export function expectedNextRalplanRole(
	state: RalplanSelectorState | undefined,
	runId: string,
): ExpectedNextRole | undefined {
	if (state?.current_phase && RALPLAN_CLOSED_PHASES.has(state.current_phase)) return undefined;
	// Pre-planner explorer gate: block every role spawn until a passing
	// context_map is recorded (or context_needed=false bypass). When the gate
	// has escalated to human_blocked there is no legal spawn remaining.
	const explorer = state?.explorerGate;
	if (explorer) {
		if (explorer.status === "human_blocked") return undefined;
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

/** Team task slice accepted by the selector. */
export interface TeamSelectorTask {
	id: string;
	status: string;
}

/** Team snapshot slice accepted by the selector. */
export interface TeamSelectorSnapshot {
	team_id?: string;
	tasks: TeamSelectorTask[];
}

/**
 * Compute the one legal next team worker spawn. v1 enforces exactly one legal
 * task: prefer the lexicographically smallest in-progress task, else the
 * smallest pending task. Returns undefined when no actionable task remains.
 */
export function expectedNextTeamRole(snapshot: TeamSelectorSnapshot | undefined): ExpectedNextRole | undefined {
	if (!snapshot) return undefined;
	if (!snapshot.team_id) return undefined;
	const inProgress = snapshot.tasks.filter((t) => t.status === "in_progress");
	const pool = inProgress.length > 0 ? inProgress : snapshot.tasks.filter((t) => t.status === "pending");
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

export function assertNoGuardedSpawnOverrides(input: {
	agent?: string;
	model?: string;
	thinkingLevel?: string;
	tools?: readonly string[];
	excludeTools?: readonly string[];
}): void {
	const overrides = [
		input.agent ? "agent" : undefined,
		input.model ? "model" : undefined,
		input.thinkingLevel ? "thinkingLevel" : undefined,
		input.tools ? "tools" : undefined,
		input.excludeTools ? "excludeTools" : undefined,
	].filter(Boolean);
	if (overrides.length > 0) {
		throw new Error(`guarded workflow spawns do not accept runtime overrides: ${overrides.join(", ")}`);
	}
}
