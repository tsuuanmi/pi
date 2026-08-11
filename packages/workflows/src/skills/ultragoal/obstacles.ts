/**
 * Typed Ultragoal obstacle records and durable ledger operations.
 *
 * This leaf module owns obstacle validation and serialization. Goal-graph
 * projection stays in `runtime.ts`, which imports this module and not the reverse.
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
} from "#workflows/audit/decision-ledger";
import { ultragoalDir } from "#workflows/session/session-layout";
import { writeJsonAtomic } from "#workflows/state/state-writer";

/**
 * Ultragoal obstacle kinds (from the decision-ledger design, Part 2). Qualitative
 * kinds (`evidence_missing`, `human_blocked`) set `needsRegression: false`; the
 * integrity wall then skips the regression-metrics requirement for them and runs
 * only the skill validator.
 */
export const ULTRAGOAL_OBSTACLE_KINDS = {
	review_failure: { label: "architect/executor review found defects", needsRegression: true },
	evidence_missing: { label: "claimed completion lacks evidence", needsRegression: false },
	scope_drift: { label: "implementation diverged from approved plan", needsRegression: true },
	contract_contradiction: { label: "work contradicts an approved decision", needsRegression: true },
	human_blocked: { label: "genuinely human-only blocker", needsRegression: false },
} satisfies ObstacleKindRegistry;

export type UltragoalObstacleKind = keyof typeof ULTRAGOAL_OBSTACLE_KINDS;
export type UltragoalResolvableObstacleKind = Exclude<UltragoalObstacleKind, "human_blocked">;

/** Kinds that must name a quality-gate criterion as their scope. */
const CRITERION_KINDS = new Set(["review_failure", "scope_drift"]);

/** Enforce Ultragoal-specific obstacle structure after shared validation. */
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

/** On-disk obstacle ledger envelope. */
export interface UltragoalObstacleLedger {
	obstacles: ObstacleTrigger[];
}

/** Read the obstacle ledger. Missing state is empty; malformed state fails closed. */
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
		throw new Error("invalid ultragoal obstacle ledger: malformed JSON");
	}
	if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
		throw new Error("invalid ultragoal obstacle ledger: expected an object");
	}
	const obstacles = (parsed as { obstacles?: unknown }).obstacles;
	if (!Array.isArray(obstacles)) {
		throw new Error("invalid ultragoal obstacle ledger: obstacles must be an array");
	}
	for (const obstacle of obstacles) assertUltragoalObstacle(obstacle as ObstacleTrigger);
	return { obstacles: obstacles as ObstacleTrigger[] };
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

/** Validate and append one obstacle through the canonical ledger writer. */
export async function appendUltragoalObstacle(
	cwd: string,
	sessionId: string,
	obstacle: ObstacleTrigger,
): Promise<void> {
	assertUltragoalObstacle(obstacle);
	const ledger = await readUltragoalObstacleLedger(cwd, sessionId);
	ledger.obstacles.push(obstacle);
	await writeJsonAtomic(ultragoalObstacleLedgerPath(cwd, sessionId), { obstacles: ledger.obstacles }, { cwd });
}

export async function resolveUltragoalObstacles(
	cwd: string,
	sessionId: string,
	goalId: string,
	resolution: string,
	resolvedAt = new Date().toISOString(),
): Promise<ObstacleTrigger[]> {
	const ledger = await readUltragoalObstacleLedger(cwd, sessionId);
	const resolved: ObstacleTrigger[] = [];
	const obstacles = ledger.obstacles.map((obstacle) => {
		if (obstacle.scope?.goalId !== goalId || obstacle.status === "resolved") return obstacle;
		const next = { ...obstacle, status: "resolved" as const, resolvedAt, resolution };
		resolved.push(next);
		return next;
	});
	if (resolved.length > 0) {
		await writeJsonAtomic(ultragoalObstacleLedgerPath(cwd, sessionId), { obstacles }, { cwd });
	}
	return resolved;
}

/** Return unresolved obstacles, optionally filtered by scope. */
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
