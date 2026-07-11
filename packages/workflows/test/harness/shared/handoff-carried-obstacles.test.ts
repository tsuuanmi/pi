import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	handoffWorkflow,
	readRalplanObstacleLedger,
	readUltragoalObstacleLedger,
	writeWorkflowState,
} from "@tsuuanmi/pi-workflows";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const TEST_SESSION = "test-session-id";

/**
 * Carried-obstacle handoff ingest.
 *
 * Defensive coverage: the ralplan-as-callee ingest branch (`writeRalplanObstacle`)
 * is currently production-unreachable, because the only ralplan callee site
 * (`executeDeepInterviewWriteSpec`) builds a `{ run_id, input }` calleePatch with
 * no `carried_obstacles`. It is kept here as a contract-invariant guard for any
 * future caller that wires obstacles into a ralplan handoff. The live production
 * path is ralplan -> ultragoal only. The team callee has no ingest handler, so a
 * `handoff-no-ingest-handler` fail-soft row is recorded once (not per-obstacle).
 */
describe("handoff carried-obstacle ingest", () => {
	let cwd: string;

	beforeEach(async () => {
		cwd = join(tmpdir(), `pi-handoff-carried-${Date.now()}-${Math.random().toString(36).slice(2)}`);
		await mkdir(cwd, { recursive: true });
	});

	afterEach(async () => {
		await rm(cwd, { recursive: true, force: true });
	});

	it("ralplan -> ultragoal (live path): ingests a carried obstacle into the ultragoal ledger", async () => {
		await writeWorkflowState(
			cwd,
			"ralplan",
			{ active: true, current_phase: "pending-approval", run_id: "run-1" },
			"pi test",
			{ sessionId: TEST_SESSION },
		);

		const result = await handoffWorkflow({
			cwd,
			caller: { skill: "ralplan", patch: { run_id: "run-1", pending_approval_path: "/plan.md" } },
			callee: {
				skill: "ultragoal",
				patch: {
					input: "/plan.md",
					carried_obstacles: [{ kind: "evidence_missing", status: "active", rationale: "no evidence" }],
				},
			},
			command: "pi test",
			sessionId: TEST_SESSION,
		});

		const ledger = await readUltragoalObstacleLedger(cwd, TEST_SESSION);
		expect(ledger.obstacles).toHaveLength(1);
		expect(ledger.obstacles[0].kind).toBe("evidence_missing");
		expect(ledger.obstacles[0].originSkill).toBe("ralplan");
		expect(result.carriedObstacleFailures).toEqual([]);
	});

	// Defensive coverage of a currently production-unreachable branch (see file docblock).
	it("deep-interview -> ralplan (defensive): ingests a carried obstacle into the ralplan ledger", async () => {
		await writeWorkflowState(cwd, "deep-interview", { active: true, current_phase: "interviewing" }, "pi test", {
			sessionId: TEST_SESSION,
		});

		const result = await handoffWorkflow({
			cwd,
			caller: {
				skill: "deep-interview",
				patch: { spec_slug: "s", spec_path: "/spec.md", spec_sha256: "abc", handoff: "ralplan" },
			},
			callee: {
				skill: "ralplan",
				patch: {
					run_id: "run-1",
					input: "/spec.md",
					carried_obstacles: [
						{ kind: "revision_required", status: "active", rationale: "critic requested changes" },
					],
				},
			},
			command: "pi test",
			sessionId: TEST_SESSION,
		});

		const ledger = await readRalplanObstacleLedger(cwd, "run-1", TEST_SESSION);
		expect(ledger.obstacles).toHaveLength(1);
		expect(ledger.obstacles[0].kind).toBe("revision_required");
		expect(ledger.obstacles[0].originSkill).toBe("deep-interview");
		expect(result.carriedObstacleFailures).toEqual([]);
	});

	it("no-op: empty carried_obstacles writes nothing and records no fail-soft errors", async () => {
		await writeWorkflowState(
			cwd,
			"ralplan",
			{ active: true, current_phase: "pending-approval", run_id: "run-1" },
			"pi test",
			{ sessionId: TEST_SESSION },
		);

		const result = await handoffWorkflow({
			cwd,
			caller: { skill: "ralplan", patch: { run_id: "run-1", pending_approval_path: "/plan.md" } },
			callee: { skill: "ultragoal", patch: { input: "/plan.md", carried_obstacles: [] } },
			command: "pi test",
			sessionId: TEST_SESSION,
		});

		const ultragoalLedger = await readUltragoalObstacleLedger(cwd, TEST_SESSION);
		expect(ultragoalLedger.obstacles).toHaveLength(0);
		expect(result.carriedObstacleFailures).toEqual([]);
	});

	it("forced-failure: a malformed carried obstacle is swallowed fail-soft (handoff still succeeds)", async () => {
		await writeWorkflowState(cwd, "deep-interview", { active: true, current_phase: "interviewing" }, "pi test", {
			sessionId: TEST_SESSION,
		});

		// plan_rejected is a REF_KIND and requires scope.planRef; omitting it makes
		// assertRalplanObstacle throw `missing_artifact_ref` deterministically.
		const result = await handoffWorkflow({
			cwd,
			caller: {
				skill: "deep-interview",
				patch: { spec_slug: "s", spec_path: "/spec.md", spec_sha256: "abc", handoff: "ralplan" },
			},
			callee: {
				skill: "ralplan",
				patch: {
					run_id: "run-1",
					input: "/spec.md",
					carried_obstacles: [{ kind: "plan_rejected", status: "active", rationale: "rejected" }],
				},
			},
			command: "pi test",
			sessionId: TEST_SESSION,
		});

		// The handoff succeeds (fail-soft), the rejected obstacle is not persisted...
		const ledger = await readRalplanObstacleLedger(cwd, "run-1", TEST_SESSION);
		expect(ledger.obstacles).toHaveLength(0);
		// ...and the failure is surfaced as one handoff-carried-obstacle fail-soft error.
		expect(result.carriedObstacleFailures).toHaveLength(1);
		expect(result.carriedObstacleFailures[0].site).toBe("handoff-carried-obstacle");
	});

	it("no-handler: a carried obstacle to a callee with no ingest handler records one fail-soft row", async () => {
		await writeWorkflowState(
			cwd,
			"ralplan",
			{ active: true, current_phase: "pending-approval", run_id: "run-1" },
			"pi test",
			{ sessionId: TEST_SESSION },
		);

		const result = await handoffWorkflow({
			cwd,
			caller: { skill: "ralplan", patch: { run_id: "run-1", pending_approval_path: "/plan.md" } },
			callee: {
				skill: "team",
				patch: {
					input: "/plan.md",
					carried_obstacles: [
						{ kind: "evidence_missing", status: "active", rationale: "a" },
						{ kind: "revision_required", status: "active", rationale: "b" },
					],
				},
			},
			command: "pi test",
			sessionId: TEST_SESSION,
		});

		// One fail-soft row for the unknown callee (not two, one per obstacle).
		expect(result.carriedObstacleFailures).toHaveLength(1);
		expect(result.carriedObstacleFailures[0].site).toBe("handoff-no-ingest-handler");
	});
});
