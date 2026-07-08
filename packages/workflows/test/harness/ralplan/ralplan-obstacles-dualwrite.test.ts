import { tmpdir } from "node:os";
import { join } from "node:path";
import { readRalplanObstacleLedger, unresolvedRalplanObstacles, writeRalplanArtifact } from "@tsuuanmi/pi-workflows";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const sessionId = "test-session-id";

/**
 * Phase R-1 dual-write integration: `writeRalplanArtifact` maps each parsed
 * critic/architect verdict to a typed obstacle and appends it to the per-run
 * ledger ALONGSIDE the durable index-row verdict. The artifact/index write path
 * is unchanged (fail-soft). The targeted approval gate (R-2 targeted) still
 * reads the verdict off the index row; this ledger is additive scaffolding for
 * R-2+ (authoritative obstacles).
 */
describe("ralplan obstacle dual-write (R-1 integration)", () => {
	let cwd: string;

	beforeEach(() => {
		cwd = join(tmpdir(), `pi-ralplan-dw-${Date.now()}-${Math.random().toString(36).slice(2)}`);
	});

	afterEach(async () => {
		const { rm } = await import("node:fs/promises");
		await rm(cwd, { recursive: true, force: true });
	});

	it("dual-writes a plan_rejected obstacle when a critic REJECT artifact is written", async () => {
		const result = await writeRalplanArtifact(
			cwd,
			{ runId: "run-1", stage: "critic", stageN: 1, artifact: "## Verdict\nREJECT\n" },
			sessionId,
		);
		expect(result.verdict).toEqual({ role: "critic", verdict: "reject" });
		const ledger = await readRalplanObstacleLedger(cwd, "run-1", sessionId);
		expect(ledger.obstacles).toHaveLength(1);
		expect(ledger.obstacles[0].kind).toBe("plan_rejected");
		expect(ledger.obstacles[0].scope?.planRef).toBe(result.path);
		expect(ledger.obstacles[0].status).toBe("active");
	});

	it("dual-writes a revision_required obstacle when a critic ITERATE artifact is written", async () => {
		const result = await writeRalplanArtifact(
			cwd,
			{ runId: "run-2", stage: "critic", stageN: 1, artifact: "## Verdict\nITERATE\n" },
			sessionId,
		);
		expect(result.verdict).toEqual({ role: "critic", verdict: "iterate" });
		const ledger = await readRalplanObstacleLedger(cwd, "run-2", sessionId);
		expect(ledger.obstacles).toHaveLength(1);
		expect(ledger.obstacles[0].kind).toBe("revision_required");
	});

	it("dual-writes an architect_block obstacle when an architect BLOCK artifact is written", async () => {
		const result = await writeRalplanArtifact(
			cwd,
			{
				runId: "run-3",
				stage: "architect",
				stageN: 1,
				artifact: "## Clarity\nBLOCK\n## Recommendation\nREQUEST CHANGES\n",
			},
			sessionId,
		);
		expect(result.verdict?.role).toBe("architect");
		const ledger = await readRalplanObstacleLedger(cwd, "run-3", sessionId);
		expect(ledger.obstacles).toHaveLength(1);
		expect(ledger.obstacles[0].kind).toBe("architect_block");
	});

	it("writes NO obstacle when a critic APPROVE artifact is written (positive verdict)", async () => {
		await writeRalplanArtifact(
			cwd,
			{ runId: "run-4", stage: "critic", stageN: 1, artifact: "## Verdict\nAPPROVE\n" },
			sessionId,
		);
		const ledger = await readRalplanObstacleLedger(cwd, "run-4", sessionId);
		expect(ledger.obstacles).toEqual([]);
	});

	it("writes NO obstacle for planner/revision/final stages (no verdict)", async () => {
		await writeRalplanArtifact(cwd, { runId: "run-5", stage: "planner", stageN: 1, artifact: "# Plan" }, sessionId);
		await writeRalplanArtifact(
			cwd,
			{ runId: "run-5", stage: "final", stageN: 2, artifact: "# Final Plan" },
			sessionId,
		);
		const ledger = await readRalplanObstacleLedger(cwd, "run-5", sessionId);
		expect(ledger.obstacles).toEqual([]);
	});

	it("does NOT double-write on dedup (identical re-write is a no-op for the ledger too)", async () => {
		const artifact = "## Verdict\nREJECT\n";
		const first = await writeRalplanArtifact(
			cwd,
			{ runId: "run-6", stage: "critic", stageN: 1, artifact },
			sessionId,
		);
		const second = await writeRalplanArtifact(
			cwd,
			{ runId: "run-6", stage: "critic", stageN: 1, artifact },
			sessionId,
		);
		expect(second.deduplicated).toBe(true);
		expect(second.path).toBe(first.path);
		const ledger = await readRalplanObstacleLedger(cwd, "run-6", sessionId);
		// Dedup returns before the dual-write block, so only the first write appended.
		expect(ledger.obstacles).toHaveLength(1);
	});

	it("accumulates obstacles across multiple critic passes in one run", async () => {
		await writeRalplanArtifact(
			cwd,
			{ runId: "run-7", stage: "critic", stageN: 1, artifact: "## Verdict\nITERATE\n" },
			sessionId,
		);
		await writeRalplanArtifact(
			cwd,
			{ runId: "run-7", stage: "critic", stageN: 2, artifact: "## Verdict\nREJECT\n" },
			sessionId,
		);
		const ledger = await readRalplanObstacleLedger(cwd, "run-7", sessionId);
		expect(ledger.obstacles).toHaveLength(2);
		expect(unresolvedRalplanObstacles(ledger)).toHaveLength(2);
	});
});
