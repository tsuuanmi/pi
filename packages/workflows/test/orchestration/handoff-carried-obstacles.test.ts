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
 * Carried-obstacle handoff ingest is strict: malformed obstacles throw,
 * unsupported callees throw, and every ingested obstacle is persisted.
 * There is no fail-soft path; `carriedObstacleFailures` was removed in favor
 * of a count of successfully ingested obstacles.
 */
describe("handoff carried-obstacle ingest (strict)", () => {
	let cwd: string;

	beforeEach(async () => {
		cwd = join(tmpdir(), `pi-handoff-carried-${Date.now()}-${Math.random().toString(36).slice(2)}`);
		await mkdir(cwd, { recursive: true });
	});

	afterEach(async () => {
		await rm(cwd, { recursive: true, force: true });
	});

	it("ralplan -> ultragoal: ingests a carried obstacle into the ultragoal ledger", async () => {
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
		expect(result.carriedObstacleCount).toBe(1);
	});

	it("deep-interview -> ralplan: ingests a carried obstacle into the ralplan ledger", async () => {
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
		expect(result.carriedObstacleCount).toBe(1);
	});

	it("no-op: empty carried_obstacles writes nothing and counts zero", async () => {
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
		expect(result.carriedObstacleCount).toBe(0);
	});

	it("throws when a carried obstacle is malformed (missing scope.planRef for plan_rejected)", async () => {
		await writeWorkflowState(cwd, "deep-interview", { active: true, current_phase: "interviewing" }, "pi test", {
			sessionId: TEST_SESSION,
		});

		await expect(
			handoffWorkflow({
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
			}),
		).rejects.toThrow();
	});

	it("throws when the callee cannot accept carried obstacles (team has no ingest handler)", async () => {
		await writeWorkflowState(
			cwd,
			"ralplan",
			{ active: true, current_phase: "pending-approval", run_id: "run-1" },
			"pi test",
			{ sessionId: TEST_SESSION },
		);

		await expect(
			handoffWorkflow({
				cwd,
				caller: { skill: "ralplan", patch: { run_id: "run-1", pending_approval_path: "/plan.md" } },
				callee: {
					skill: "team",
					patch: {
						input: "/plan.md",
						carried_obstacles: [{ kind: "evidence_missing", status: "active", rationale: "a" }],
					},
				},
				command: "pi test",
				sessionId: TEST_SESSION,
			}),
		).rejects.toThrow(/cannot accept carried obstacles/);
	});
});
