import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { assertRalplanSubagentSpawn, recordRalplanAgentExecution } from "#workflows/skills/ralplan/agent-execution";
import { writeRalplanArtifact } from "#workflows/skills/ralplan/artifacts";
import { recordRalplanExplorerGateArtifact } from "#workflows/skills/ralplan/gates";
import { writeWorkflowState } from "#workflows/state/workflow-state";

const sessionId = "agent-execution-session";

describe("ralplan agent execution policy", () => {
	let cwd: string;

	beforeEach(async () => {
		cwd = join(tmpdir(), `pi-ralplan-agent-${Date.now()}-${Math.random().toString(36).slice(2)}`);
		await mkdir(cwd, { recursive: true });
		await writeWorkflowState(cwd, "ralplan", { active: true, current_phase: "planner", run_id: "run-1" }, "test", {
			sessionId,
		});
	});

	afterEach(async () => {
		await rm(cwd, { recursive: true, force: true });
	});

	it("admits only the workflow-selected profile and metadata", async () => {
		await expect(
			assertRalplanSubagentSpawn(
				{
					agent: "explorer",
					role: "explorer",
					systemPrompt: "Map context and persist the explorer gate.",
					metadata: {
						workflow: "ralplan",
						owner: "ralplan",
						runId: "run-1",
						stage: "pre-planner",
						stageN: 1,
						role: "explorer",
					},
				},
				cwd,
				sessionId,
			),
		).resolves.toBe(true);
		await expect(
			assertRalplanSubagentSpawn(
				{
					agent: "planner",
					role: "planner",
					systemPrompt: "Plan.",
					metadata: {
						workflow: "ralplan",
						owner: "ralplan",
						runId: "run-1",
						stage: "planner",
						stageN: 1,
						role: "planner",
					},
				},
				cwd,
				sessionId,
			),
		).rejects.toThrow(/off-script spawn refused: stage planner != pre-planner/);
	});

	it("records terminal runs and fails closed without the workflow artifact", async () => {
		const error = await recordRalplanAgentExecution(cwd, sessionId, {
			id: "subagent-1",
			role: "explorer",
			status: "completed",
			cwd,
			resumable: true,
			created_at: "2026-01-01T00:00:00.000Z",
			updated_at: "2026-01-01T00:00:01.000Z",
			execution_metadata: {
				workflow: "ralplan",
				owner: "ralplan",
				runId: "run-1",
				stage: "pre-planner",
				stageN: 1,
				role: "explorer",
			},
		});
		expect(error).toMatch(/without a valid workflow artifact/);
	});

	it("accepts completed runs after the semantic artifact transaction", async () => {
		await recordRalplanExplorerGateArtifact(
			cwd,
			{ runId: "run-1", contextMap: { context_needed: false, summary: "No additional context." } },
			sessionId,
		);
		await writeRalplanArtifact(cwd, { runId: "run-1", stage: "planner", stageN: 1, artifact: "# Plan\n" }, sessionId);
		const error = await recordRalplanAgentExecution(cwd, sessionId, {
			id: "subagent-2",
			role: "planner",
			status: "completed",
			cwd,
			resumable: true,
			created_at: "2026-01-01T00:00:00.000Z",
			updated_at: "2026-01-01T00:00:01.000Z",
			execution_metadata: {
				workflow: "ralplan",
				owner: "ralplan",
				runId: "run-1",
				stage: "planner",
				stageN: 1,
				role: "planner",
			},
		});
		expect(error).toBeUndefined();
	});
});
