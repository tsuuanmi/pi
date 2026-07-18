/**
 * Ultragoal typed-obstacle ledger (Phase B-0, additive dual-write).
 *
 * Ships the ultragoal obstacle kinds, the ultragoal skill validator, and a
 * per-skill session-scoped obstacle ledger (`.pi/<session-id>/ultragoal/obstacles.json`)
 * ALONGSIDE — not replacing — the existing review-blocker model (the steering
 * `review_blocker` goal + the `review_blockers_recorded` ledger event). Nothing
 * here is read by the guard or checkpoint path yet (that is Phase B-1/B-2), so
 * existing behavior and tests are unaffected.
 *
 * The integrity wall (`validateObstacles`, from `shared/audit/decision-ledger.ts`) gates
 * every obstacle insert: an active `review_failure`/`scope_drift`/`contract_contradiction`
 * kind must prove a regression, and the ultragoal validator adds structural checks
 * (criterion-naming kinds must name a criterion; `human_blocked` must not carry a
 * regression). `recordUltragoalObstacle` (in `ultragoal-runtime.ts`) is the dual-write
 * that runs this wall before touching the legacy path.
 *
 * Acyclic module graph: this is a LEAF module. It imports only
 * `shared/audit/decision-ledger.ts`, `shared/session/session-layout.ts`, `shared/state/state-writer.ts`,
 * and node built-ins. It MUST NOT import `ultragoal-runtime.ts` (runtime imports
 * this module, not the reverse) — mirrors the `ultragoal-receipt.ts` contract.
 */
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import {
	type ObstacleInput,
	type ObstacleKindRegistry,
	type ObstacleStatus,
	type ObstacleTrigger,
	type ObstacleValidator,
	type ObstacleViolation,
	validateObstacles,
} from "../shared/audit/decision-ledger.ts";
import { ultragoalDir } from "../shared/session/session-layout.ts";
import { writeJsonAtomic } from "../shared/state/state-writer.ts";

/**
 * Ultragoal obstacle kinds (from the decision-ledger design, Part 2). Qualitative
 * kinds (`evidence_missing`, `human_blocked`) set `needsRegression: false`; the
 * integrity wall then skips the regression-metrics requirement for them and runs
 * only the skill validator.
 */
export const ULTRAGOAL_OBSTACLE_KINDS: ObstacleKindRegistry = {
	review_failure: { label: "architect/executor review found defects", needsRegression: true },
	evidence_missing: { label: "claimed completion lacks evidence", needsRegression: false },
	scope_drift: { label: "implementation diverged from approved plan", needsRegression: true },
	contract_contradiction: { label: "work contradicts an approved decision", needsRegression: true },
	human_blocked: { label: "genuinely human-only blocker", needsRegression: false },
};

/** Kinds that must name a quality-gate criterion as their scope. */
const CRITERION_KINDS = new Set(["review_failure", "scope_drift"]);

/**
 * Ultragoal skill validator (Phase B-0 subset). Enforces the two structural
 * invariants from the design that need no metric provider:
 *   - `review_failure` / `scope_drift` must name the criterion they block
 *   - `human_blocked` must not carry a regression (no metric to regress)
 *
 * The numeric "did the criterion actually regress?" check (the design's
 * `ctx.prior/next.metricValue`) is a Phase B-1/B-2 concern, wired once the
 * quality-gate metric provider exists; it is intentionally NOT enforced here.
 */
export const ultragoalObstacleValidator: ObstacleValidator<void> = {
	validateActive(obstacle: ObstacleInput): ObstacleViolation[] {
		const violations: ObstacleViolation[] = [];
		if (CRITERION_KINDS.has(obstacle.kind) && !obstacle.scope?.criterion) {
			violations.push({ code: "missing_criterion", kind: obstacle.kind });
		}
		if (obstacle.kind === "human_blocked" && obstacle.regression) {
			violations.push({ code: "human_blocked_no_regression", kind: obstacle.kind });
		}
		return violations;
	},
};

/** Path to the ultragoal obstacle ledger (session-scoped, per-skill Tier-1). */
export function ultragoalObstacleLedgerPath(cwd: string, sessionId: string): string {
	return join(ultragoalDir(cwd, sessionId), "obstacles.json");
}

/** On-disk ledger shape. `facts` is added in Phase B-4 (cross-skill contract). */
export interface UltragoalObstacleLedger {
	obstacles: ObstacleTrigger[];
}

/**
 * Read the ultragoal obstacle ledger. Missing file -> empty ledger. A present
 * but malformed file (not `{ obstacles: [] }`) also yields an empty ledger rather
 * than throwing, so a corrupt obstacle ledger can never block the existing gate
 * (B-0 keeps the gate unchanged).
 */
export async function readUltragoalObstacleLedger(cwd: string, sessionId: string): Promise<UltragoalObstacleLedger> {
	const path = ultragoalObstacleLedgerPath(cwd, sessionId);
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
	return { obstacles: (parsed as UltragoalObstacleLedger).obstacles };
}

/** Input to build a durable ultragoal obstacle record. */
export interface UltragoalObstacleInput {
	kind: string;
	name: string;
	status: ObstacleStatus;
	scope?: ObstacleInput["scope"];
	evidence?: string;
	rationale?: string;
	regression?: ObstacleInput["regression"];
	/** Id of the originating goal (the blocked goal). */
	originRef: string;
}

/** Build a durable obstacle record (assigns id + provenance). No I/O. */
export function buildUltragoalObstacle(input: UltragoalObstacleInput, now: string): ObstacleTrigger {
	return {
		id: randomUUID(),
		kind: input.kind,
		name: input.name,
		status: input.status,
		scope: input.scope,
		evidence: input.evidence,
		rationale: input.rationale,
		regression: input.regression,
		originSkill: "ultragoal",
		originRef: input.originRef,
		createdAt: now,
	};
}

/** Format a violation for an error message. */
function formatViolation(v: ObstacleViolation): string {
	switch (v.code) {
		case "no_regression":
			return `${v.code}(${v.kind}:${v.metric ?? "?"}:${v.priorValue ?? "?"}->${v.newValue ?? "?"})`;
		default:
			return `${v.code}(${v.kind})`;
	}
}

/**
 * Pure validation (the integrity wall). No I/O. Runs `validateObstacles` with
 * `priorPresent: true` (an obstacle is recorded against the current goal state,
 * so the regression check is active) and the ultragoal kind registry + validator.
 */
export function validateUltragoalObstacle(obstacle: ObstacleInput): {
	ok: boolean;
	violations: ObstacleViolation[];
} {
	return validateObstacles([obstacle], ultragoalObstacleValidator, undefined, {
		priorPresent: true,
		registry: ULTRAGOAL_OBSTACLE_KINDS,
	});
}

/** Throw if the obstacle fails the integrity wall. No I/O. */
export function assertUltragoalObstacle(obstacle: ObstacleInput): void {
	const result = validateUltragoalObstacle(obstacle);
	if (!result.ok) {
		throw new Error(`invalid ultragoal obstacle: ${result.violations.map(formatViolation).join("; ")}`);
	}
}

/** Write-only append of an already-validated obstacle (no re-validation). */
export async function writeUltragoalObstacle(cwd: string, sessionId: string, obstacle: ObstacleTrigger): Promise<void> {
	const ledger = await readUltragoalObstacleLedger(cwd, sessionId);
	ledger.obstacles.push(obstacle);
	await writeJsonAtomic(ultragoalObstacleLedgerPath(cwd, sessionId), { obstacles: ledger.obstacles }, { cwd });
}

/**
 * The integrity-gated insert: build + validate + append to the ledger. Throws on
 * violation (the wall). Returns the new obstacle. Self-contained: callers that
 * go through `recordUltragoalObstacle` instead get the dual-write (legacy path too).
 */
export async function appendUltragoalObstacle(
	cwd: string,
	sessionId: string,
	input: UltragoalObstacleInput,
	now: string,
): Promise<ObstacleTrigger> {
	const obstacle = buildUltragoalObstacle(input, now);
	assertUltragoalObstacle(obstacle);
	await writeUltragoalObstacle(cwd, sessionId, obstacle);
	return obstacle;
}

/**
 * Closure query (Phase B-1 will wire this into the guard alongside
 * `activeRecordedBlocker`). Returns obstacles that are NOT resolved, optionally
 * filtered by scope. A resolved obstacle never blocks. This is the ultragoal
 * analogue of deep-interview's closure-guard query.
 */
export function unresolvedUltragoalObstacles(
	ledger: UltragoalObstacleLedger,
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
