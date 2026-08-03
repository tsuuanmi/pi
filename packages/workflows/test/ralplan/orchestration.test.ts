import { mkdir, readdir, readFile, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
	buildRalplanOrchestrationSnapshot,
	doctorRalplan,
	ralplanCompletionProvenancePath,
	ralplanIndexPath,
	ralplanStageArtifactPath,
	readRalplanStatus,
	selectExpectedRalplanAction,
	transactionJournalPath,
	writeRalplanArtifact,
} from "@tsuuanmi/pi-workflows";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const sessionId = "test-session-id";

describe("ralplan deterministic orchestration harness", () => {
	let cwd: string;

	beforeEach(() => {
		cwd = join(tmpdir(), `pi-ralplan-orchestration-${Date.now()}-${Math.random().toString(36).slice(2)}`);
	});

	afterEach(async () => {
		await rm(cwd, { recursive: true, force: true });
	});

	it("commits artifact, index, state, provenance, HUD, and journal marker consistently", async () => {
		const result = await writeRalplanArtifact(
			cwd,
			{ runId: "run-1", stage: "final", stageN: 1, artifact: "# Final" },
			sessionId,
		);

		expect(result.journalPath).toBeDefined();
		expect(JSON.parse(await readFile(result.journalPath!, "utf8"))).toMatchObject({ status: "committed" });
		expect(JSON.parse(await readFile(result.completionProvenancePath!, "utf8"))).toMatchObject({
			run_id: "run-1",
			stage: "final",
			stage_n: 1,
			artifact_sha256: result.sha256,
		});
		const status = await readRalplanStatus(cwd, sessionId, "run-1");
		expect(status.rows).toHaveLength(1);
		expect(status.pending_approval).toBe(true);
	});

	it("fails invalid index attempts before product-visible writes", async () => {
		const indexPath = ralplanIndexPath(cwd, "run-2", sessionId);
		await mkdir(dirname(indexPath), { recursive: true });
		await writeFile(indexPath, "not-json\n", "utf8");
		const artifactPath = ralplanStageArtifactPath(cwd, "run-2", 1, "planner", sessionId);

		await expect(
			writeRalplanArtifact(cwd, { runId: "run-2", stage: "planner", stageN: 1, artifact: "# Plan" }, sessionId),
		).rejects.toThrow(/invalid index lines/);
		await expect(readFile(artifactPath, "utf8")).rejects.toThrow();
	});

	it("deduplicates same-hash writes and repairs missing completion sidecars", async () => {
		const first = await writeRalplanArtifact(
			cwd,
			{ runId: "run-3", stage: "planner", stageN: 1, artifact: "# Plan" },
			sessionId,
		);
		await unlink(ralplanCompletionProvenancePath(first.path));
		const duplicate = await writeRalplanArtifact(
			cwd,
			{ runId: "run-3", stage: "planner", stageN: 1, artifact: "# Plan" },
			sessionId,
		);

		expect(duplicate.deduplicated).toBe(true);
		expect(JSON.parse(await readFile(ralplanCompletionProvenancePath(first.path), "utf8"))).toMatchObject({
			artifact_sha256: first.sha256,
		});
		expect((await readRalplanStatus(cwd, sessionId, "run-3")).rows).toHaveLength(1);
	});

	it("builds stable snapshots and selects the deterministic next action", async () => {
		await writeRalplanArtifact(cwd, { runId: "run-4", stage: "planner", stageN: 1, artifact: "# Plan" }, sessionId);
		const snapshot = await buildRalplanOrchestrationSnapshot({ cwd, sessionId, runId: "run-4" });
		const again = await buildRalplanOrchestrationSnapshot({ cwd, sessionId, runId: "run-4" });

		expect(snapshot.version).toBe(1);
		expect(snapshot.fingerprint).toBe(again.fingerprint);
		expect(snapshot.index.rows.map((row) => row.stage)).toEqual(["planner"]);
		expect(selectExpectedRalplanAction(snapshot)).toMatchObject({
			kind: "spawn",
			expected: { stage: "architect", role: "architect" },
		});
	});

	it("accepts all ralplan stages in the durable index parser", async () => {
		const indexPath = ralplanIndexPath(cwd, "run-stage", sessionId);
		await mkdir(dirname(indexPath), { recursive: true });
		await writeFile(
			indexPath,
			[
				{ stage: "pre-planner", stage_n: 1, path: "/tmp/explorer.md", sha256: "a", created_at: "now" },
				{ stage: "expert-stage", stage_n: 2, path: "/tmp/expert.md", sha256: "b", created_at: "now" },
			]
				.map((row) => JSON.stringify(row))
				.join("\n"),
			"utf8",
		);

		const status = await readRalplanStatus(cwd, sessionId, "run-stage");
		expect(status.invalid_index_lines).toEqual([]);
		expect(status.rows.map((row) => row.stage)).toEqual(["pre-planner", "expert-stage"]);
	});

	it("keeps append order for same-iteration planner architect critic flow", async () => {
		await writeRalplanArtifact(cwd, { runId: "run-4b", stage: "planner", stageN: 1, artifact: "# Plan" }, sessionId);
		await writeRalplanArtifact(
			cwd,
			{ runId: "run-4b", stage: "architect", stageN: 1, artifact: "Verdict: APPROVE" },
			sessionId,
		);
		await writeRalplanArtifact(
			cwd,
			{ runId: "run-4b", stage: "critic", stageN: 1, artifact: "Verdict: APPROVE" },
			sessionId,
		);

		const snapshot = await buildRalplanOrchestrationSnapshot({ cwd, sessionId, runId: "run-4b" });
		expect(snapshot.index.rows.map((row) => row.stage)).toEqual(["planner", "architect", "critic"]);
		expect(selectExpectedRalplanAction(snapshot)).toMatchObject({ kind: "closed", reason: "critic approved" });
	});

	it("doctor and snapshots discover stale transaction journals from disk", async () => {
		const path = transactionJournalPath(cwd, sessionId, "ralplan-orchestration-stale");
		await mkdir(dirname(path), { recursive: true });
		await writeFile(
			path,
			`${JSON.stringify({ type: "ralplan_completion", status: "pending", run_id: "run-5", steps: [{ step: "intent", status: "pending" }] })}\n`,
			"utf8",
		);
		expect((await readdir(dirname(path))).some((file) => file.endsWith(".json"))).toBe(true);
		expect(
			(await doctorRalplan(cwd, sessionId, "run-5")).warnings.some((warning) => warning.includes("stale intent")),
		).toBe(true);
		const snapshot = await buildRalplanOrchestrationSnapshot({ cwd, sessionId, runId: "run-5" });
		expect(snapshot.transactionJournal.health).toBe("stale_intent");
		expect(selectExpectedRalplanAction(snapshot)).toMatchObject({ kind: "blocked", reason: "stale_intent" });
	});

	it("accepts committed ralplan journals as complete snapshot evidence", async () => {
		await writeRalplanArtifact(cwd, { runId: "run-6", stage: "planner", stageN: 1, artifact: "# Plan" }, sessionId);
		const snapshot = await buildRalplanOrchestrationSnapshot({ cwd, sessionId, runId: "run-6" });
		expect(snapshot.transactionJournal.health).toBe("complete");
		expect(selectExpectedRalplanAction(snapshot)).toMatchObject({
			kind: "spawn",
			expected: { stage: "architect", role: "architect" },
		});
	});
});
