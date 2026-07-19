/**
 * Ralplan typed-obstacle ledger (Phase R-1, additive dual-write).
 *
 * Ships the ralplan obstacle kinds, the ralplan skill validator, a per-run
 * obstacle ledger (`<run-dir>/obstacles.json`), and the verdict->obstacle
 * mapping. `writeRalplanArtifact` (in `ralplan-runtime.ts`) is the dual-write
 * that maps each parsed critic/architect verdict to an obstacle and appends it
 * ALONGSIDE the durable index-row verdict (the R-1 prerequisite). Nothing here
 * is read by the approval/doctor path yet (that is R-2 onward), so existing
 * behavior and tests are unaffected.
 *
 * The integrity wall (`validateObstacles`, from `shared/audit/decision-ledger.ts`)
 * gates every insert. All ralplan kinds are qualitative (`needsRegression:
 * false`), so the wall skips the regression-metrics requirement and runs only
 * the ralplan skill validator: the kind must be known, and ref-citing kinds
 * (`plan_rejected`/`scope_drift`/`contract_contradiction`) must cite a `planRef`.
 * The full "the cited defect must exist and be quotable in the artifact" check
 * (the design's `ctx.indexHas`/`ctx.artifactContains`) is an R-2+ concern; it is
 * intentionally NOT enforced here, mirroring the B-0 subset-validator approach.
 *
 * Acyclic module graph: this is a LEAF module. It imports only
 * `shared/audit/decision-ledger.ts`, `shared/session/session-layout.ts`, `shared/state/state-writer.ts`,
 * its sibling `ralplan-verdicts.ts` (a pure leaf), and node built-ins. It MUST
 * NOT import `ralplan-runtime.ts` (runtime imports this module, not the reverse).
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
} from "#workflows/harness/shared/audit/decision-ledger";
import { ralplanObstacleLedgerPath } from "#workflows/harness/shared/session/session-layout";
import { writeJsonAtomic } from "#workflows/harness/shared/state/state-writer";
import type {
	RalplanArchitectVerdict,
	RalplanCriticVerdict,
	RalplanCriticVerdictKind,
	RalplanVerdict,
} from "#workflows/skills/ralplan/ralplan-verdicts";

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

/**
 * Ralplan skill validator (Phase R-1 subset, no context provider). Enforces the
 * structural invariants that need no index/artifact reads:
 *   - the kind must be a known ralplan kind
 *   - ref-citing kinds must carry a `scope.planRef`
 *
 * The "cited stage artifact exists and quotes the finding" check (the design's
 * `ctx.indexHas`/`ctx.artifactContains`) is R-2+, wired once obstacles become
 * authoritative; intentionally NOT enforced here.
 */
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

/** On-disk ledger shape. `facts` is added in R-4 (cross-skill contract). */
export interface RalplanObstacleLedger {
	obstacles: ObstacleTrigger[];
}

/**
 * Read the per-run ralplan obstacle ledger. Missing file -> empty ledger. A
 * present but malformed file also yields an empty ledger rather than throwing,
 * so a corrupt obstacle ledger can never block the existing write/approval
 * path (R-1 keeps those paths unchanged).
 */
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
		return { obstacles: [] };
	}
	if (!parsed || typeof parsed !== "object" || !Array.isArray((parsed as { obstacles?: unknown }).obstacles)) {
		return { obstacles: [] };
	}
	return { obstacles: (parsed as RalplanObstacleLedger).obstacles };
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

/** Write-only append of an already-validated obstacle (no re-validation). */
export async function writeRalplanObstacle(
	cwd: string,
	runId: string,
	sessionId: string,
	obstacle: ObstacleTrigger,
): Promise<void> {
	const ledger = await readRalplanObstacleLedger(cwd, runId, sessionId);
	ledger.obstacles.push(obstacle);
	await writeJsonAtomic(ralplanObstacleLedgerPath(cwd, runId, sessionId), { obstacles: ledger.obstacles }, { cwd });
}

/**
 * The integrity-gated insert: build + validate + append. Throws on violation
 * (the wall). Returns the new obstacle. Callers that go through the
 * `writeRalplanArtifact` dual-write instead get the fail-soft path (see
 * `ralplan-runtime.ts`).
 */
export async function appendRalplanObstacle(
	cwd: string,
	runId: string,
	sessionId: string,
	input: RalplanObstacleInput,
	now: string,
): Promise<ObstacleTrigger> {
	const obstacle = buildRalplanObstacle(input, now);
	assertRalplanObstacle(obstacle);
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

/**
 * Closure query (R-2 will wire this into the approval/doctor path). Returns
 * obstacles that are NOT resolved, optionally filtered by scope. A resolved
 * obstacle never blocks. This is the ralplan analogue of deep-interview's
 * closure-guard query and ultragoal's `unresolvedUltragoalObstacles`.
 */
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
