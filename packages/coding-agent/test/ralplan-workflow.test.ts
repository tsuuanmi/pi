import { appendFile, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { SubagentRunResult } from "../src/core/subagents.ts";
import { readWorkflowActiveState } from "../src/workflows/active-state.ts";
import { ralplanIndexPath } from "../src/workflows/paths.ts";
import { ralplanRoleForStage, runRalplanAgent } from "../src/workflows/ralplan-agents.ts";
import {
	approveRalplanPlan,
	doctorRalplan,
	readRalplanCompactStatus,
	readRalplanStatus,
	writeRalplanArtifact,
} from "../src/workflows/ralplan-runtime.ts";
import { readWorkflowState } from "../src/workflows/workflow-state.ts";

describe("ralplan workflow runtime", () => {
	let cwd: string;

	beforeEach(() => {
		cwd = join(tmpdir(), `pi-ralplan-${Date.now()}-${Math.random().toString(36).slice(2)}`);
	});

	afterEach(async () => {
		await rm(cwd, { recursive: true, force: true });
	});

	it("deduplicates identical stage writes", async () => {
		const first = await writeRalplanArtifact(cwd, {
			runId: "run-1",
			stage: "planner",
			stageN: 1,
			artifact: "# Plan",
		});
		const duplicate = await writeRalplanArtifact(cwd, {
			runId: "run-1",
			stage: "planner",
			stageN: 1,
			artifact: "# Plan",
		});

		expect(first.deduplicated).toBe(false);
		expect(duplicate.deduplicated).toBe(true);
		expect(duplicate.path).toBe(first.path);
		const status = await readRalplanStatus(cwd, "run-1");
		expect(status.rows).toHaveLength(1);
	});

	it("rejects conflicting writes before mutating state", async () => {
		await writeRalplanArtifact(cwd, {
			runId: "run-1",
			stage: "critic",
			stageN: 1,
			artifact: "# Critic A",
		});
		await expect(
			writeRalplanArtifact(cwd, {
				runId: "run-1",
				stage: "critic",
				stageN: 1,
				artifact: "# Critic B",
			}),
		).rejects.toThrow(/refusing to overwrite/);

		const status = await readRalplanStatus(cwd, "run-1");
		expect(status.rows).toHaveLength(1);
		expect(status.latest?.sha256).toBe(status.rows[0].sha256);
	});

	it("writes final artifact, pending approval, status, doctor, and HUD", async () => {
		const result = await writeRalplanArtifact(cwd, {
			runId: "run-2",
			stage: "final",
			stageN: 2,
			artifact: "# Final Plan",
		});

		expect(result.pendingApprovalPath).toBeDefined();
		const state = await readWorkflowState(cwd, "ralplan");
		expect(state?.current_phase).toBe("pending-approval");
		expect(state?.pending_approval_path).toBe(result.pendingApprovalPath);
		const status = await readRalplanStatus(cwd, "run-2");
		expect(status.pending_approval).toBe(true);
		expect(status.iteration).toBe(2);
		expect(status.stages.final).toBe(2);
		expect((await doctorRalplan(cwd, "run-2")).ok).toBe(true);
		const active = await readWorkflowActiveState(cwd);
		expect(active?.active_workflows.find((entry) => entry.skill === "ralplan")?.hud?.chips?.length).toBeGreaterThan(
			0,
		);
	});

	it("doctor reports artifact hash conflicts", async () => {
		const result = await writeRalplanArtifact(cwd, {
			runId: "run-3",
			stage: "architect",
			stageN: 1,
			artifact: "# Architecture",
		});
		await appendFile(result.path, "tamper\n", "utf8");

		const doctor = await doctorRalplan(cwd, "run-3");
		expect(doctor.ok).toBe(false);
		expect(doctor.problems.some((problem) => problem.includes("sha256 mismatch"))).toBe(true);
	});

	it("reports malformed index lines in status and doctor", async () => {
		const indexPath = ralplanIndexPath(cwd, "run-4");
		await mkdir(dirname(indexPath), { recursive: true });
		await writeFile(indexPath, '{"stage":"planner"}\nnot-json\n', "utf8");

		const status = await readRalplanStatus(cwd, "run-4");
		expect(status.invalid_index_lines).toHaveLength(2);
		const compact = await readRalplanCompactStatus(cwd, "run-4");
		expect(compact.invalid_index_line_count).toBe(2);
		const doctor = await doctorRalplan(cwd, "run-4");
		expect(doctor.ok).toBe(false);
		expect(doctor.problems.filter((problem) => problem.includes("invalid index line"))).toHaveLength(2);
	});

	it("approval gate demotes ralplan and promotes the approved target workflow", async () => {
		const final = await writeRalplanArtifact(cwd, {
			runId: "run-5",
			stage: "final",
			stageN: 1,
			artifact: "# Approved Plan",
		});

		const result = await approveRalplanPlan(cwd, { runId: "run-5", target: "ultragoal", note: "approved" });

		expect(result.pendingApprovalPath).toBe(final.pendingApprovalPath);
		expect(result.ralplanState.active).toBe(false);
		expect(result.ralplanState.current_phase).toBe("handoff");
		expect(result.targetState?.skill).toBe("ultragoal");
		expect(result.targetState?.input).toBe(final.pendingApprovalPath);
		const status = await readRalplanStatus(cwd, "run-5");
		expect(status.pending_approval).toBe(false);
		const active = await readWorkflowActiveState(cwd);
		expect(active?.active_workflows.some((entry) => entry.skill === "ralplan")).toBe(false);
		expect(active?.active_workflows.some((entry) => entry.skill === "ultragoal")).toBe(true);
	});

	it("records ralplan role-agent invocations", async () => {
		expect(ralplanRoleForStage("revision")).toBe("planner");
		const result = await runRalplanAgent(cwd, {
			role: "architect",
			runId: "run-6",
			stage: "architect",
			stageN: 2,
			task: "Review the persisted planner artifact.",
			contextArtifacts: [".pi/plans/ralplan/run-6/stage-01-planner.md"],
			dryRun: true,
		});

		expect(result.status).toBe("planned");
		expect(result.role).toBe("architect");
		expect(result.record_path).toContain(".pi/workflows/ralplan/agents/");
		expect(result.output).toContain("Context artifacts");
	});

	it("runs ralplan role agents through the subagent manager when available", async () => {
		let spawnPrompt = "";
		const subagentResult: SubagentRunResult = {
			record: {
				id: "subagent-planner-1",
				role: "ralplan:planner",
				status: "completed",
				cwd,
				resumable: true,
				created_at: "2026-01-01T00:00:00.000Z",
				updated_at: "2026-01-01T00:00:01.000Z",
			},
			messages: [],
			output: "planner receipt",
		};
		const result = await runRalplanAgent(cwd, {
			role: "planner",
			runId: "run-subagent",
			stage: "planner",
			stageN: 1,
			task: "Plan it.",
			subagentManager: {
				spawn: async (request) => {
					spawnPrompt = request.prompt;
					return subagentResult;
				},
				resume: async () => ({ ok: false, reason: "not_found" }),
			},
		});

		expect(spawnPrompt).toContain("Run id: run-subagent");
		expect(result.status).toBe("completed");
		expect(result.planner_subagent_id).toBe("subagent-planner-1");
		expect(result.output).toBe("planner receipt");
	});

	it("falls back to fresh planner spawn when planner resume is unavailable", async () => {
		const calls: string[] = [];
		const result = await runRalplanAgent(cwd, {
			role: "planner",
			runId: "run-resume",
			stage: "revision",
			stageN: 2,
			task: "Revise it.",
			plannerSubagentId: "old-planner",
			attemptResume: true,
			subagentManager: {
				resume: async () => {
					calls.push("resume");
					return { ok: false, reason: "context_unavailable" };
				},
				spawn: async () => {
					calls.push("spawn");
					return {
						record: {
							id: "new-planner",
							role: "ralplan:planner",
							status: "completed",
							cwd,
							resumable: true,
							created_at: "2026-01-01T00:00:00.000Z",
							updated_at: "2026-01-01T00:00:01.000Z",
						},
						messages: [],
						output: "revision receipt",
					};
				},
			},
		});

		expect(calls).toEqual(["resume", "spawn"]);
		expect(result.planner_subagent_id).toBe("new-planner");
		expect(result.fallback_reason).toBe("context_unavailable");
	});

	it("persists planner identity and fallback metadata", async () => {
		const planner = await writeRalplanArtifact(cwd, {
			runId: "run-7",
			stage: "planner",
			stageN: 1,
			artifact: "# Planner",
			plannerSubagentId: "planner-1",
			plannerResumable: true,
		});
		expect(planner.plannerState).toMatchObject({ plannerSubagentId: "planner-1", plannerResumable: true });
		let state = await readWorkflowState(cwd, "ralplan");
		expect(state?.planner_subagent_id).toBe("planner-1");
		expect(state?.planner_resumable).toBe(true);

		const revision = await writeRalplanArtifact(cwd, {
			runId: "run-7",
			stage: "revision",
			stageN: 2,
			artifact: "# Revision",
			plannerSubagentId: "planner-2",
			plannerResumable: false,
			fallbackReason: "no_runner",
			fallbackAttemptedId: "planner-1",
			fallbackStageN: 2,
			fallbackReceiptPath: planner.path,
		});
		expect(revision.plannerState?.fallbackReason).toBe("no_runner");
		state = await readWorkflowState(cwd, "ralplan");
		expect(state?.planner_subagent_id).toBe("planner-2");
		expect(state?.planner_resumable).toBe(false);
		expect(state?.planner_fallback_reason).toBe("no_runner");
		expect(state?.planner_fallback_attempted_id).toBe("planner-1");
		expect(state?.planner_fallback_stage_n).toBe(2);
	});

	it("requires complete planner fallback metadata", async () => {
		await expect(
			writeRalplanArtifact(cwd, {
				runId: "run-8",
				stage: "revision",
				stageN: 2,
				artifact: "# Revision",
				fallbackReason: "no_runner",
			}),
		).rejects.toThrow(/fallbackAttemptedId/);
	});
});
