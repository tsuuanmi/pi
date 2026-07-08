import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	appendRalplanObstacle,
	assertRalplanObstacle,
	buildRalplanObstacle,
	type ObstacleTrigger,
	RALPLAN_OBSTACLE_KINDS,
	type RalplanVerdict,
	ralplanObstacleFromVerdict,
	ralplanObstacleValidator,
	readRalplanObstacleLedger,
	unresolvedRalplanObstacles,
	validateRalplanObstacle,
	writeRalplanObstacle,
} from "@tsuuanmi/pi-workflows";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const sessionId = "test-session-id";

/**
 * Phase R-1 unit tests for the ralplan obstacle leaf module: kind registry,
 * skill validator (subset), verdict->obstacle mapping, ledger I/O, and the
 * closure query. The dual-write integration with `writeRalplanArtifact` lives in
 * `ralplan-obstacles-dualwrite.test.ts`.
 */
describe("ralplan obstacles (R-1)", () => {
	let cwd: string;

	beforeEach(() => {
		cwd = join(tmpdir(), `pi-ralplan-obs-${Date.now()}-${Math.random().toString(36).slice(2)}`);
	});

	afterEach(async () => {
		const { rm } = await import("node:fs/promises");
		await rm(cwd, { recursive: true, force: true });
	});

	describe("kind registry", () => {
		it("registers all five ralplan obstacle kinds as qualitative (no regression)", () => {
			expect(Object.keys(RALPLAN_OBSTACLE_KINDS).sort()).toEqual(
				["architect_block", "contract_contradiction", "plan_rejected", "revision_required", "scope_drift"].sort(),
			);
			for (const kind of Object.keys(RALPLAN_OBSTACLE_KINDS)) {
				expect(RALPLAN_OBSTACLE_KINDS[kind].needsRegression).toBe(false);
			}
		});
	});

	describe("skill validator (R-1 subset)", () => {
		it("rejects an unknown kind", () => {
			const v = ralplanObstacleValidator.validateActive?.({ kind: "bogus", status: "active" });
			expect(v).toContainEqual(expect.objectContaining({ code: "unknown_kind", kind: "bogus" }));
		});

		it("requires scope.planRef for ref-citing kinds", () => {
			const v = ralplanObstacleValidator.validateActive?.({ kind: "plan_rejected", status: "active" });
			expect(v).toContainEqual(expect.objectContaining({ code: "missing_artifact_ref", kind: "plan_rejected" }));
		});

		it("does not require planRef for revision_required / architect_block", () => {
			for (const kind of ["revision_required", "architect_block"] as const) {
				const v = ralplanObstacleValidator.validateActive?.({ kind, status: "active" });
				expect(v).toEqual([]);
			}
		});

		it("passes a well-formed plan_rejected with a planRef", () => {
			const v = ralplanObstacleValidator.validateActive?.({
				kind: "plan_rejected",
				status: "active",
				scope: { planRef: ".pi/plans/ralplan/run-1/stage-01-critic.md" },
			});
			expect(v).toEqual([]);
		});
	});

	describe("integrity wall (validateRalplanObstacle / assertRalplanObstacle)", () => {
		it("validates a well-formed obstacle (no regression required for qualitative kinds)", () => {
			const r = validateRalplanObstacle({
				kind: "plan_rejected",
				status: "active",
				scope: { planRef: ".pi/plans/ralplan/run-1/stage-01-critic.md" },
			});
			expect(r.ok).toBe(true);
			expect(r.violations).toEqual([]);
		});

		it("rejects a plan_rejected without a planRef", () => {
			expect(() => assertRalplanObstacle({ kind: "plan_rejected", status: "active" })).toThrow(
				/missing_artifact_ref/,
			);
		});
	});

	describe("verdict -> obstacle mapping (ralplanObstacleFromVerdict)", () => {
		const planRef = ".pi/plans/ralplan/run-1/stage-02-critic.md";

		it("maps critic REJECT -> plan_rejected citing the artifact", () => {
			const verdict = { role: "critic", verdict: "reject" } as RalplanVerdict;
			const o = ralplanObstacleFromVerdict(verdict, planRef, "now");
			expect(o?.kind).toBe("plan_rejected");
			expect(o?.status).toBe("active");
			expect(o?.scope?.planRef).toBe(planRef);
			expect(o?.originSkill).toBe("ralplan");
			expect(o?.originRef).toBe(planRef);
			expect(o?.id).toBeTruthy();
		});

		it("maps critic ITERATE -> revision_required", () => {
			const o = ralplanObstacleFromVerdict({ role: "critic", verdict: "iterate" } as RalplanVerdict, planRef, "now");
			expect(o?.kind).toBe("revision_required");
		});

		it("maps critic APPROVE -> no obstacle (positive verdict)", () => {
			expect(
				ralplanObstacleFromVerdict({ role: "critic", verdict: "approve" } as RalplanVerdict, planRef, "now"),
			).toBeUndefined();
		});

		it("maps architect BLOCK -> architect_block (priority over recommendation)", () => {
			const o = ralplanObstacleFromVerdict(
				{ role: "architect", clarity: "block", recommendation: "request_changes" } as RalplanVerdict,
				planRef,
				"now",
			);
			expect(o?.kind).toBe("architect_block");
		});

		it("maps architect REQUEST_CHANGES (clarity watch) -> revision_required", () => {
			const o = ralplanObstacleFromVerdict(
				{ role: "architect", clarity: "watch", recommendation: "request_changes" } as RalplanVerdict,
				planRef,
				"now",
			);
			expect(o?.kind).toBe("revision_required");
		});

		it("maps architect APPROVE -> no obstacle (positive verdict)", () => {
			expect(
				ralplanObstacleFromVerdict(
					{ role: "architect", clarity: "clear", recommendation: "approve" } as RalplanVerdict,
					planRef,
					"now",
				),
			).toBeUndefined();
		});

		it("carries the parsed rationale as evidence when present", () => {
			const o = ralplanObstacleFromVerdict(
				{ role: "critic", verdict: "reject", rationale: "missing test plan" } as RalplanVerdict,
				planRef,
				"now",
			);
			expect(o?.evidence).toBe("missing test plan");
		});

		it("produced obstacles pass the integrity wall", () => {
			for (const verdict of [
				{ role: "critic", verdict: "reject" },
				{ role: "critic", verdict: "iterate" },
				{ role: "architect", clarity: "block", recommendation: "request_changes" },
				{ role: "architect", clarity: "watch", recommendation: "request_changes" },
			] as RalplanVerdict[]) {
				const o = ralplanObstacleFromVerdict(verdict, planRef, "now");
				expect(o, `verdict ${JSON.stringify(verdict)} should map`).toBeDefined();
				expect(validateRalplanObstacle(o as ObstacleTrigger).ok).toBe(true);
			}
		});
	});

	describe("ledger I/O", () => {
		it("reads an empty ledger when the file is missing", async () => {
			const ledger = await readRalplanObstacleLedger(cwd, "run-1", sessionId);
			expect(ledger.obstacles).toEqual([]);
		});

		it("appendRalplanObstacle writes and the obstacle is readable + unresolved", async () => {
			const now = "2026-01-01T00:00:00.000Z";
			const obstacle = await appendRalplanObstacle(
				cwd,
				"run-1",
				sessionId,
				{
					kind: "plan_rejected",
					name: "critic rejected the plan",
					status: "active",
					scope: { planRef: ".pi/plans/ralplan/run-1/stage-01-critic.md" },
					originRef: ".pi/plans/ralplan/run-1/stage-01-critic.md",
				},
				now,
			);
			const ledger = await readRalplanObstacleLedger(cwd, "run-1", sessionId);
			expect(ledger.obstacles).toHaveLength(1);
			expect(ledger.obstacles[0].id).toBe(obstacle.id);
			expect(unresolvedRalplanObstacles(ledger)).toHaveLength(1);
		});

		it("a malformed ledger reads back empty (fail-soft, never blocks)", async () => {
			const { writeFile, mkdir } = await import("node:fs/promises");
			const { ralplanObstacleLedgerPath } = await import("@tsuuanmi/pi-workflows");
			await mkdir(join(cwd, ".pi/test-session-id/plans/ralplan/run-1"), { recursive: true });
			await writeFile(ralplanObstacleLedgerPath(cwd, "run-1", sessionId), "{not json", "utf8");
			const ledger = await readRalplanObstacleLedger(cwd, "run-1", sessionId);
			expect(ledger.obstacles).toEqual([]);
		});

		it("writeRalplanObstacle appends without re-validating and preserves prior entries", async () => {
			const now = "2026-01-01T00:00:00.000Z";
			const a = buildRalplanObstacle(
				{ kind: "plan_rejected", name: "r1", status: "active", scope: { planRef: "p1" }, originRef: "p1" },
				now,
			);
			await writeRalplanObstacle(cwd, "run-1", sessionId, a);
			const b = buildRalplanObstacle(
				{ kind: "revision_required", name: "r2", status: "active", originRef: "p2" },
				now,
			);
			await writeRalplanObstacle(cwd, "run-1", sessionId, b);
			const ledger = await readRalplanObstacleLedger(cwd, "run-1", sessionId);
			expect(ledger.obstacles).toHaveLength(2);
		});
	});

	describe("closure query (unresolvedRalplanObstacles)", () => {
		it("excludes resolved obstacles and filters by scope.planRef", async () => {
			const now = "2026-01-01T00:00:00.000Z";
			await writeRalplanObstacle(
				cwd,
				"run-1",
				sessionId,
				buildRalplanObstacle(
					{ kind: "plan_rejected", name: "a", status: "active", scope: { planRef: "ref-A" }, originRef: "ref-A" },
					now,
				),
			);
			await writeRalplanObstacle(
				cwd,
				"run-1",
				sessionId,
				buildRalplanObstacle({ kind: "revision_required", name: "b", status: "resolved", originRef: "ref-B" }, now),
			);
			await writeRalplanObstacle(
				cwd,
				"run-1",
				sessionId,
				buildRalplanObstacle(
					{ kind: "plan_rejected", name: "c", status: "active", scope: { planRef: "ref-C" }, originRef: "ref-C" },
					now,
				),
			);
			const ledger = await readRalplanObstacleLedger(cwd, "run-1", sessionId);
			expect(unresolvedRalplanObstacles(ledger)).toHaveLength(2); // resolved excluded
			expect(unresolvedRalplanObstacles(ledger, { scope: { planRef: "ref-A" } })).toHaveLength(1);
			expect(unresolvedRalplanObstacles(ledger, { scope: { planRef: "ref-C" } })[0].name).toBe("c");
		});
	});
});
