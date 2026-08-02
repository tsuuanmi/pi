import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { createTeamTask, executeTeam, readTeamSnapshot, resumeTeam, startTeam } from "@tsuuanmi/pi-workflows";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { teamCheckpointPath, teamReceiptsPath } from "#workflows/session/session-layout";
import { createTeamAgents } from "#workflows/skills/team/agent-adapter";
import { createFakeManager } from "#workflows-test/team/team-fakes";

const sessionId = "execution-test";

describe("team execution boundary", () => {
	let cwd: string;

	beforeEach(() => {
		cwd = join(tmpdir(), `pi-team-execution-${Date.now()}-${Math.random().toString(36).slice(2)}`);
	});

	afterEach(async () => {
		await rm(cwd, { recursive: true, force: true });
	});

	it("rejects an empty agent roster", async () => {
		const snapshot = await createSnapshot(cwd);
		await expect(
			executeTeam({
				cwd,
				sessionId,
				runId: "run-1",
				role: "worker",
				snapshot,
				tasks: snapshot.tasks,
				persistIds: ["task-1"],
				agents: [],
			}),
		).rejects.toThrow("team orchestrator requires at least one agent");
		const failed = await readTeamSnapshot(cwd, sessionId, "team-1");
		expect(failed.tasks[0]?.execution).toMatchObject({ status: "failed" });
		expect(failed.tasks[0]?.execution?.error).toContain("team orchestrator requires at least one agent");
	});

	it("retries a transient role failure", async () => {
		const snapshot = await createSnapshot(cwd);
		let attempts = 0;
		const manager = createFakeManager(async () => {
			attempts += 1;
			if (attempts === 1) throw new Error("transient role failure");
		});
		const agents = createTeamAgents(manager, sessionId, [
			{ id: "worker", profile: "worker", capabilities: ["worker"] },
		]);

		const result = await executeTeam({
			cwd,
			sessionId,
			runId: "run-retry",
			role: "worker",
			snapshot,
			tasks: snapshot.tasks,
			persistIds: ["task-1"],
			agents,
			routes: { "task-1": { capabilities: ["worker"], maxRetries: 1, retryDelayMs: 0 } },
		});

		expect(result.tasks[0]?.execution?.status).toBe("completed");
		expect(attempts).toBe(2);
		const checkpoint = JSON.parse(
			await readFile(teamCheckpointPath(cwd, "team-1", sessionId, "run-retry"), "utf8"),
		) as { receipts: Record<string, { attempts: number; retryCount: number }> };
		expect(checkpoint.receipts["task-1"]).toMatchObject({ attempts: 2, retryCount: 1 });
	});

	it("persists failure when execution is aborted", async () => {
		const snapshot = await createSnapshot(cwd);
		const controller = new AbortController();
		let startedResolve: (() => void) | undefined;
		const started = new Promise<void>((resolve) => {
			startedResolve = resolve;
		});
		const manager = createFakeManager(async (request) => {
			startedResolve?.();
			await new Promise<never>((_, reject) => {
				if (!request.signal) return reject(new Error("missing abort signal"));
				if (request.signal.aborted) return reject(new Error("worker aborted"));
				request.signal.addEventListener("abort", () => reject(new Error("worker aborted")), { once: true });
			});
		});
		const agents = createTeamAgents(manager, sessionId, [
			{ id: "worker", profile: "worker", capabilities: ["worker"] },
		]);
		const execution = executeTeam({
			cwd,
			sessionId,
			runId: "run-abort",
			role: "worker",
			snapshot,
			tasks: snapshot.tasks,
			persistIds: ["task-1"],
			agents,
			routes: { "task-1": { capabilities: ["worker"] } },
			options: { abortSignal: controller.signal },
		});

		await started;
		controller.abort();
		await expect(execution).rejects.toThrow();
		const failed = await readTeamSnapshot(cwd, sessionId, "team-1");
		expect(failed.tasks[0]?.execution).toMatchObject({ status: "failed" });
	});

	it("rejects resume without a checkpoint", async () => {
		const snapshot = await createSnapshot(cwd);
		await expect(
			resumeTeam({
				cwd,
				sessionId,
				runId: "run-1",
				role: "worker",
				snapshot,
				tasks: snapshot.tasks,
				persistIds: ["task-1"],
				agents: [],
			}),
		).rejects.toThrow("team resume requires an existing checkpoint");
	});

	it("persists checkpoint receipts when resume fails", async () => {
		const snapshot = await createSnapshot(cwd);
		const path = teamCheckpointPath(cwd, "team-1", sessionId, "run-1");
		await mkdir(dirname(path), { recursive: true });
		await writeFile(
			path,
			JSON.stringify({
				status: "running",
				receipts: {
					"receipt-1": {
						receiptId: "receipt-1",
						runId: "run-1",
						taskId: "task-1",
						taskTitle: "Task",
						status: "completed",
						attempts: 1,
						startedAt: "2026-08-02T00:00:00.000Z",
						completedAt: "2026-08-02T00:00:01.000Z",
						durationMs: 1000,
						retryCount: 0,
					},
				},
			}),
			"utf8",
		);

		await expect(
			resumeTeam({
				cwd,
				sessionId,
				runId: "run-1",
				role: "worker",
				snapshot,
				tasks: snapshot.tasks,
				persistIds: ["task-1"],
				agents: [],
			}),
		).rejects.toThrow("team orchestrator requires at least one agent");

		const rows = (await readFile(teamReceiptsPath(cwd, "team-1", sessionId), "utf8"))
			.trim()
			.split("\n")
			.map((line) => JSON.parse(line) as { id: string });
		expect(rows).toHaveLength(1);
		expect(rows[0]?.id).toBe("receipt-1");
	});

	it("rejects fresh execution when a checkpoint exists", async () => {
		const snapshot = await createSnapshot(cwd);
		const path = teamCheckpointPath(cwd, "team-1", sessionId, "run-1");
		await mkdir(dirname(path), { recursive: true });
		await writeFile(path, JSON.stringify({ status: "running" }), "utf8");

		await expect(
			executeTeam({
				cwd,
				sessionId,
				runId: "run-1",
				role: "worker",
				snapshot,
				tasks: snapshot.tasks,
				persistIds: ["task-1"],
				agents: [],
			}),
		).rejects.toThrow("team fresh execution cannot reuse an existing checkpoint");
	});
});

async function createSnapshot(cwd: string) {
	await startTeam(cwd, { teamId: "team-1", task: "Approved team task" }, sessionId);
	await createTeamTask(
		cwd,
		{
			teamId: "team-1",
			id: "task-1",
			title: "Task",
			description: "Execute task",
		},
		sessionId,
	);
	return readTeamSnapshot(cwd, sessionId, "team-1");
}
