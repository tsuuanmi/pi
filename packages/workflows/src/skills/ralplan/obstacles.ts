/**
 * Ralplan typed-obstacle model and durable per-run ledger.
 *
 * Artifact completion maps architect and critic verdicts to validated obstacles
 * inside the completion transaction. Approval, doctor, and orchestration reads
 * consume the same authoritative ledger. This leaf depends only on audit,
 * session, state-writer, verdict, and Node primitives.
 */
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import {
	type ObstacleInput,
	type ObstacleKindRegistry,
	type ObstacleStatus,
	type ObstacleTrigger,
	type ObstacleValidator,
	type ObstacleViolation,
	validateObstacles,
} from "#workflows/audit/decision-ledger";
import { ralplanObstacleLedgerPath } from "#workflows/skills/ralplan/paths";
import type {
	RalplanArchitectVerdict,
	RalplanCriticVerdict,
	RalplanCriticVerdictKind,
	RalplanVerdict,
} from "#workflows/skills/ralplan/verdicts";
import { writeJsonAtomic } from "#workflows/state/state-writer";

/**
 * Ralplan obstacle kinds (from the decision-ledger design, Part 3). All are
 * qualitative (`needsRegression: false`): a critic/architect verdict is a
 * judgment, not a metric regression, so the wall runs only the skill validator.
 */
export const RALPLAN_OBSTACLE_KINDS: ObstacleKindRegistry = {
	plan_rejected: { label: "critic rejected the plan", needsRegression: false },
	revision_required: { label: "critic/architect requested changes", needsRegression: false },
	architect_block: { label: "architect blocked on a decision", needsRegression: false },
	scope_drift: { label: "plan diverged from a prior stage", needsRegression: false },
	contract_contradiction: { label: "plan contradicts an approved decision", needsRegression: false },
};

/** Kinds that must cite a stage artifact via `scope.planRef`. */
const REF_KINDS = new Set(["plan_rejected", "scope_drift", "contract_contradiction"]);

/** Validate the skill-owned obstacle kind and required artifact reference. */
export const ralplanObstacleValidator: ObstacleValidator<void> = {
	validateActive(obstacle: ObstacleInput): ObstacleViolation[] {
		const violations: ObstacleViolation[] = [];
		if (!RALPLAN_OBSTACLE_KINDS[obstacle.kind]) violations.push({ code: "unknown_kind", kind: obstacle.kind });
		if (REF_KINDS.has(obstacle.kind) && !obstacle.scope?.planRef) {
			violations.push({ code: "missing_artifact_ref", kind: obstacle.kind });
		}
		return violations;
	},
};

/** On-disk obstacle-ledger shape. */
export interface RalplanObstacleLedger {
	obstacles: ObstacleTrigger[];
}

/** Read the per-run obstacle ledger. Missing state is empty; malformed state fails closed. */
export async function readRalplanObstacleLedger(
	cwd: string,
	runId: string,
	sessionId: string,
): Promise<RalplanObstacleLedger> {
	const path = ralplanObstacleLedgerPath(cwd, runId, sessionId);
	let raw: string;
	try {
		raw = await readFile(path, "utf8");
	} catch (error) {
		const err = error as NodeJS.ErrnoException;
		if (err.code === "ENOENT") return { obstacles: [] };
		throw error;
	}
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		throw new Error("invalid ralplan obstacle ledger: malformed JSON");
	}
	if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
		throw new Error("invalid ralplan obstacle ledger: expected an object");
	}
	const obstacles = (parsed as { obstacles?: unknown }).obstacles;
	if (!Array.isArray(obstacles)) {
		throw new Error("invalid ralplan obstacle ledger: obstacles must be an array");
	}
	for (const obstacle of obstacles) assertStoredRalplanObstacle(obstacle);
	return { obstacles };
}

/** Input to build a durable ralplan obstacle record. */
export interface RalplanObstacleInput {
	kind: string;
	name: string;
	status: ObstacleStatus;
	scope?: ObstacleInput["scope"];
	evidence?: string;
	rationale?: string;
	regression?: ObstacleInput["regression"];
	/** Id of the originating stage artifact (the critic/architect pass). */
	originRef: string;
}

/** Build a durable obstacle record (assigns id + provenance). No I/O. */
export function buildRalplanObstacle(input: RalplanObstacleInput, now: string): ObstacleTrigger {
	return {
		id: randomUUID(),
		kind: input.kind,
		name: input.name,
		status: input.status,
		scope: input.scope,
		evidence: input.evidence,
		rationale: input.rationale,
		regression: input.regression,
		originSkill: "ralplan",
		originRef: input.originRef,
		createdAt: now,
	};
}

/** Format a violation for an error message. */
function formatViolation(v: ObstacleViolation): string {
	switch (v.code) {
		case "missing_artifact_ref":
			return `${v.code}(${v.kind})`;
		case "unknown_kind":
			return `${v.code}(${v.kind})`;
		default:
			return `${v.code}(${v.kind})`;
	}
}

/**
 * Pure validation (the integrity wall). No I/O. Runs `validateObstacles` with
 * `priorPresent: true` and the ralplan kind registry + validator. All ralplan
 * kinds are qualitative, so the wall runs only the skill validator.
 */
export function validateRalplanObstacle(obstacle: ObstacleInput): {
	ok: boolean;
	violations: ObstacleViolation[];
} {
	return validateObstacles([obstacle], ralplanObstacleValidator, undefined, {
		priorPresent: true,
		registry: RALPLAN_OBSTACLE_KINDS,
	});
}

/** Throw if the obstacle fails the integrity wall. No I/O. */
export function assertRalplanObstacle(obstacle: ObstacleInput): void {
	const result = validateRalplanObstacle(obstacle);
	if (!result.ok) {
		throw new Error(`invalid ralplan obstacle: ${result.violations.map(formatViolation).join("; ")}`);
	}
}

const OBSTACLE_STATUSES = new Set<ObstacleStatus>(["active", "disputed", "unresolved", "resolved"]);
const OBSTACLE_ORIGIN_SKILLS = new Set(["deep-interview", "ralplan", "team", "ultragoal"]);

function assertStoredRalplanObstacle(value: unknown): asserts value is ObstacleTrigger {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		throw new Error("invalid ralplan obstacle ledger: obstacle must be an object");
	}
	const obstacle = value as Partial<ObstacleTrigger>;
	for (const field of ["id", "kind", "name", "originRef", "createdAt"] as const) {
		if (typeof obstacle[field] !== "string" || obstacle[field].trim().length === 0) {
			throw new Error(`invalid ralplan obstacle ledger: obstacle.${field} is required`);
		}
	}
	if (!obstacle.originSkill || !OBSTACLE_ORIGIN_SKILLS.has(obstacle.originSkill)) {
		throw new Error("invalid ralplan obstacle ledger: obstacle.originSkill is invalid");
	}
	if (!obstacle.status || !OBSTACLE_STATUSES.has(obstacle.status)) {
		throw new Error("invalid ralplan obstacle ledger: obstacle.status is invalid");
	}
	assertRalplanObstacle(obstacle as ObstacleTrigger);
}

/** Validate and append one persisted obstacle. */
export async function writeRalplanObstacle(
	cwd: string,
	runId: string,
	sessionId: string,
	obstacle: ObstacleTrigger,
): Promise<void> {
	assertStoredRalplanObstacle(obstacle);
	const ledger = await readRalplanObstacleLedger(cwd, runId, sessionId);
	ledger.obstacles.push(obstacle);
	await writeJsonAtomic(ralplanObstacleLedgerPath(cwd, runId, sessionId), { obstacles: ledger.obstacles }, { cwd });
}

/** Build, validate, and append one obstacle; integrity violations fail closed. */
export async function appendRalplanObstacle(
	cwd: string,
	runId: string,
	sessionId: string,
	input: RalplanObstacleInput,
	now: string,
): Promise<ObstacleTrigger> {
	const obstacle = buildRalplanObstacle(input, now);
	await writeRalplanObstacle(cwd, runId, sessionId, obstacle);
	return obstacle;
}

/**
 * Map a parsed critic/architect verdict to a ralplan obstacle, or `undefined`
 * when the verdict is positive/commentary (no blocker to record):
 *   - critic REJECT          -> `plan_rejected`
 *   - critic ITERATE          -> `revision_required`
 *   - critic APPROVE          -> (none)
 *   - architect BLOCK         -> `architect_block` (priority over recommendation)
 *   - architect REQUEST_CHANGES -> `revision_required`
 *   - architect APPROVE/COMMENT -> (none)
 *
 * The obstacle cites the stage artifact via `scope.planRef` and carries the
 * parsed rationale as evidence. Pure, no I/O.
 */
export function ralplanObstacleFromVerdict(
	verdict: RalplanVerdict,
	planRef: string,
	now: string,
): ObstacleTrigger | undefined {
	let kind: string | undefined;
	if (verdict.role === "critic") {
		const cv = (verdict as RalplanCriticVerdict).verdict as RalplanCriticVerdictKind;
		if (cv === "reject") kind = "plan_rejected";
		else if (cv === "iterate") kind = "revision_required";
	} else {
		const av = verdict as RalplanArchitectVerdict;
		if (av.clarity === "block") kind = "architect_block";
		else if (av.recommendation === "request_changes") kind = "revision_required";
	}
	if (!kind) return undefined;
	return buildRalplanObstacle(
		{
			kind,
			name: RALPLAN_OBSTACLE_KINDS[kind]?.label ?? kind,
			status: "active",
			scope: { planRef },
			evidence: verdict.rationale,
			originRef: planRef,
		},
		now,
	);
}

/** Return unresolved obstacles, optionally restricted to one artifact scope. */
export function unresolvedRalplanObstacles(
	ledger: RalplanObstacleLedger,
	filter?: { scope?: Partial<NonNullable<ObstacleInput["scope"]>> },
): ObstacleTrigger[] {
	return ledger.obstacles.filter((obstacle) => {
		if (obstacle.status === "resolved") return false;
		if (!filter?.scope) return true;
		const s = filter.scope;
		if (s.goalId !== undefined && obstacle.scope?.goalId !== s.goalId) return false;
		if (s.criterion !== undefined && obstacle.scope?.criterion !== s.criterion) return false;
		if (s.component !== undefined && obstacle.scope?.component !== s.component) return false;
		if (s.dimension !== undefined && obstacle.scope?.dimension !== s.dimension) return false;
		if (s.planRef !== undefined && obstacle.scope?.planRef !== s.planRef) return false;
		return true;
	});
}
