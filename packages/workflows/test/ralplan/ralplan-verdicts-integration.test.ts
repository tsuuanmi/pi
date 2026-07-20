import { tmpdir } from "node:os";
import { join } from "node:path";
import { readRalplanStatus, writeRalplanArtifact } from "@tsuuanmi/pi-workflows";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const sessionId = "test-session-id";

/**
 * R-1 prerequisite integration: writing a critic/architect artifact parses the
 * verdict onto the durable index row (and the write result); planner and
 * verdict-less critic artifacts stay undefined (fail-open). Dedup preserves
 * the verdict from the first write.
 */
describe("ralplan writeRalplanArtifact — verdict wiring (R-1 prereq)", () => {
	let cwd: string;

	beforeEach(() => {
		cwd = join(tmpdir(), `pi-ralplan-verdict-${Date.now()}-${Math.random().toString(36).slice(2)}`);
	});

	afterEach(async () => {
		const { rm } = await import("node:fs/promises");
		await rm(cwd, { recursive: true, force: true });
	});

	it("parses a critic verdict onto the index row and the write result", async () => {
		const result = await writeRalplanArtifact(
			cwd,
			{
				runId: "run-v",
				stage: "critic",
				stageN: 1,
				artifact: "## Critic review\n\n## Verdict\nITERATE\nRationale: scope is too broad.",
			},
			sessionId,
		);

		expect(result.verdict).toEqual({
			role: "critic",
			verdict: "iterate",
			rationale: "scope is too broad.",
		});

		const status = await readRalplanStatus(cwd, sessionId, "run-v");
		expect(status.rows).toHaveLength(1);
		expect(status.rows[0].verdict).toEqual({
			role: "critic",
			verdict: "iterate",
			rationale: "scope is too broad.",
		});
	});

	it("parses an architect verdict onto the index row", async () => {
		await writeRalplanArtifact(
			cwd,
			{
				runId: "run-v",
				stage: "architect",
				stageN: 1,
				artifact: "## Architect review\n\nClarity: WATCH\nRecommendation: REQUEST CHANGES\n",
			},
			sessionId,
		);

		const status = await readRalplanStatus(cwd, sessionId, "run-v");
		expect(status.rows[0].verdict).toEqual({
			role: "architect",
			clarity: "watch",
			recommendation: "request_changes",
		});
	});

	it("leaves planner artifacts without a verdict", async () => {
		const result = await writeRalplanArtifact(
			cwd,
			{ runId: "run-v", stage: "planner", stageN: 1, artifact: "# Plan with no verdict" },
			sessionId,
		);
		expect(result.verdict).toBeUndefined();

		const status = await readRalplanStatus(cwd, sessionId, "run-v");
		expect(status.rows[0].verdict).toBeUndefined();
	});

	it("fails open (undefined verdict) for a verdict-less critic artifact; row stays valid", async () => {
		const result = await writeRalplanArtifact(
			cwd,
			{ runId: "run-v", stage: "critic", stageN: 1, artifact: "# Critic review with no verdict token" },
			sessionId,
		);
		expect(result.verdict).toBeUndefined();

		const status = await readRalplanStatus(cwd, sessionId, "run-v");
		expect(status.rows).toHaveLength(1);
		expect(status.invalid_index_lines).toHaveLength(0);
		expect(status.rows[0].verdict).toBeUndefined();
	});

	it("preserves the verdict across a deduplicated re-write", async () => {
		const artifact = "## Verdict\nREJECT\n";
		const first = await writeRalplanArtifact(
			cwd,
			{ runId: "run-v", stage: "critic", stageN: 1, artifact },
			sessionId,
		);
		expect(first.deduplicated).toBe(false);
		const duplicate = await writeRalplanArtifact(
			cwd,
			{ runId: "run-v", stage: "critic", stageN: 1, artifact },
			sessionId,
		);

		expect(duplicate.deduplicated).toBe(true);
		const firstV = first.verdict;
		const dupV = duplicate.verdict;
		if (!firstV || firstV.role !== "critic" || !dupV || dupV.role !== "critic") {
			throw new Error("expected critic verdicts on both writes");
		}
		expect(firstV.verdict).toBe("reject");
		expect(dupV.verdict).toBe("reject");
	});
});
