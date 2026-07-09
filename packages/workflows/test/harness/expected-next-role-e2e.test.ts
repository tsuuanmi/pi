import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@tsuuanmi/pi-coding-agent";
import workflowsExtension from "@tsuuanmi/pi-workflows";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const TEST_SESSION = "e2e-tool-session";

interface CapturedTool {
	name: string;
	execute(
		toolCallId: string,
		params: unknown,
		signal: AbortSignal | undefined,
		onUpdate: unknown,
		ctx: ExtensionContext,
	): Promise<unknown>;
}

/** Minimal SubagentRunResult mock for a successful subagent. */
function okRun(taskId: string) {
	return {
		record: { id: `sub-${taskId}`, status: "completed" as const },
		messages: [],
		output: `${taskId} receipt`,
	};
}

function createToolHarness(cwd: string): {
	tool: (name: string) => CapturedTool;
	ctx: ExtensionContext;
	spawns: { taskId?: string; role?: string }[];
} {
	const tools = new Map<string, CapturedTool>();
	const spawns: { taskId?: string; role?: string }[] = [];
	const api = {
		registerTool(tool: CapturedTool): void {
			tools.set(tool.name, tool);
		},
		registerCommand(): void {},
		on(): void {},
		sendUserMessage(): void {},
	} as unknown as ExtensionAPI;
	workflowsExtension(api);
	const subagents = {
		spawn: async (req: { role?: string; label?: string }) => {
			spawns.push({ role: req.role, taskId: req.label });
			return okRun(req.label ?? req.role ?? "x");
		},
		resume: async () => ({ ok: true as const, result: okRun("resume") }),
	};
	const ctx = {
		cwd,
		mode: "json",
		hasUI: false,
		sessionManager: { getSessionId: () => TEST_SESSION },
		subagents,
	} as unknown as ExtensionContext;
	return {
		tool(name: string): CapturedTool {
			const found = tools.get(name);
			if (!found) throw new Error(`tool not registered: ${name}`);
			return found;
		},
		ctx,
		spawns,
	};
}

async function call(harness: ReturnType<typeof createToolHarness>, name: string, params: unknown): Promise<unknown> {
	return harness.tool(name).execute("call", params, undefined, undefined, harness.ctx);
}

describe("expected-next-role tool-layer E2E", () => {
	let cwd: string;

	beforeEach(() => {
		cwd = join(tmpdir(), `pi-e2e-${Date.now()}-${Math.random().toString(36).slice(2)}`);
	});
	afterEach(async () => {
		await rm(cwd, { recursive: true, force: true });
	});

	describe("ralplan deterministic selector (tool layer)", () => {
		it("blocks planner until the explorer gate passes, then drives the full verdict flow", async () => {
			const h = createToolHarness(cwd);
			const run = "run-e2e-ralplan";

			// 1. Before the explorer gate, planner spawn is deterministically refused
			//    by the selector (expected pre-planner/explorer). No subagent is spawned.
			await expect(
				call(h, "ralplan_run_agent", { runId: run, stage: "planner", stageN: 1, task: "plan" }),
			).rejects.toThrow(/explorer context_map|pre-planner explorer gate/);
			expect(h.spawns).toHaveLength(0);

			// 2. Record a passing explorer gate (context_needed=false bypass).
			await call(h, "ralplan_record_explorer_gate", {
				runId: run,
				contextMap: { context_needed: false, summary: "trivial" },
			});

			// 3. Planner spawn is now the legal next role and succeeds.
			await call(h, "ralplan_run_agent", { runId: run, stage: "planner", stageN: 1, task: "plan" });
			expect(h.spawns.at(-1)?.role).toBe("planner");

			// 4. Off-sequence spawn refused: after planner, legal next is architect, not critic.
			await expect(
				call(h, "ralplan_run_agent", { runId: run, stage: "critic", stageN: 1, task: "critique" }),
			).rejects.toThrow(/off-script spawn refused/);
			expect(h.spawns.filter((s) => s.role === "critic")).toHaveLength(0);

			// 5. Persist planner artifact -> selector advances to architect.
			await call(h, "ralplan_write_artifact", { runId: run, stage: "planner", stageN: 1, artifact: "# Plan" });
			await call(h, "ralplan_run_agent", { runId: run, stage: "architect", stageN: 1, task: "review" });
			expect(h.spawns.at(-1)?.role).toBe("architect");

			// 6. Architect CLEAR -> selector advances to critic.
			await call(h, "ralplan_write_artifact", {
				runId: run,
				stage: "architect",
				stageN: 1,
				artifact: "# Arch\nClarity: CLEAR\nRecommendation: approve",
			});
			await call(h, "ralplan_run_agent", { runId: run, stage: "critic", stageN: 1, task: "critique" });
			expect(h.spawns.at(-1)?.role).toBe("critic");

			// 7. Critic APPROVE closes the run; no further role spawn is legal.
			await call(h, "ralplan_write_artifact", {
				runId: run,
				stage: "critic",
				stageN: 1,
				artifact: "# Critic\nVerdict: APPROVE",
			});
			await expect(
				call(h, "ralplan_run_agent", { runId: run, stage: "planner", stageN: 2, task: "x" }),
			).rejects.toThrow(/no legal next ralplan role spawn/);
		});

		it("routes a critic REJECT back to revision via selector state", async () => {
			const h = createToolHarness(cwd);
			const run = "run-e2e-reject";
			await call(h, "ralplan_record_explorer_gate", {
				runId: run,
				contextMap: { context_needed: false, summary: "trivial" },
			});
			await call(h, "ralplan_write_artifact", { runId: run, stage: "planner", stageN: 1, artifact: "# Plan" });
			await call(h, "ralplan_write_artifact", {
				runId: run,
				stage: "architect",
				stageN: 1,
				artifact: "# Arch\nClarity: CLEAR\nRecommendation: approve",
			});
			await call(h, "ralplan_write_artifact", {
				runId: run,
				stage: "critic",
				stageN: 1,
				artifact: "# Critic\nVerdict: REJECT",
			});
			// After critic REJECT, the legal next is revision (planner role), not architect.
			await expect(
				call(h, "ralplan_run_agent", { runId: run, stage: "architect", stageN: 2, task: "review" }),
			).rejects.toThrow(/off-script spawn refused/);
			await call(h, "ralplan_run_agent", { runId: run, stage: "revision", stageN: 2, task: "revise" });
			expect(h.spawns.at(-1)?.role).toBe("planner");
		});

		it("refuses runtime model/thinkingLevel overrides on guarded spawns", async () => {
			const h = createToolHarness(cwd);
			const run = "run-e2e-override";
			await call(h, "ralplan_record_explorer_gate", {
				runId: run,
				contextMap: { context_needed: false, summary: "trivial" },
			});
			await expect(
				call(h, "ralplan_run_agent", {
					runId: run,
					stage: "planner",
					stageN: 1,
					task: "plan",
					model: "frontier/x",
					thinkingLevel: "high",
				}),
			).rejects.toThrow(/runtime overrides.*model.*thinkingLevel/);
			expect(h.spawns).toHaveLength(0);
		});
	});

	describe("team deterministic selector (tool layer)", () => {
		it("enforces lexicographic task order, review gate, and prover completion gate", async () => {
			const h = createToolHarness(cwd);
			const team = "team-e2e";
			await call(h, "team_start", { task: "force:E2E team", teamId: team });
			await call(h, "team_create_task", { teamId: team, id: "task-b", title: "B", description: "do b" });
			await call(h, "team_create_task", { teamId: team, id: "task-a", title: "A", description: "do a" });

			// Lexicographic order: task-a is the legal next; spawning task-b is refused.
			await expect(call(h, "team_spawn_task_agent", { teamId: team, taskId: "task-b" })).rejects.toThrow(
				/off-script spawn refused.*task task-b != task-a/,
			);
			expect(h.spawns).toHaveLength(0);

			// Spawn the legal next task (task-a).
			await call(h, "team_spawn_task_agent", { teamId: team, taskId: "task-a" });
			expect(h.spawns.at(-1)?.taskId).toBe(`team-${team}-task-a`);

			// Review gate passes (low severity, no changes needed) -> task can complete.
			await call(h, "team_record_review_gate", {
				teamId: team,
				taskId: "task-a",
				reviewReport: { max_severity: "low", needs_changes: false, summary: "ok" },
			});
			await call(h, "team_transition_task", {
				teamId: team,
				taskId: "task-a",
				status: "completed",
				evidence: { summary: "Implemented task-a: tests pass and files modified", recorded_by: "worker" },
			});

			// Now task-b is the legal next.
			await call(h, "team_spawn_task_agent", { teamId: team, taskId: "task-b" });
			await call(h, "team_record_review_gate", {
				teamId: team,
				taskId: "task-b",
				reviewReport: { max_severity: "low", needs_changes: false, summary: "ok" },
			});
			await call(h, "team_transition_task", {
				teamId: team,
				taskId: "task-b",
				status: "completed",
				evidence: { summary: "Implemented task-b: tests pass and files modified", recorded_by: "worker" },
			});

			// Prover completion gate must pass before the team can complete.
			await call(h, "team_record_completion_gate", {
				teamId: team,
				evidenceMatrix: { ship_decision: "ship", escalation: "none", summary: "all verified" },
			});
			const result = (await call(h, "team_complete", { teamId: team, phase: "complete" })) as {
				content: { text: string }[];
			};
			expect(result.content[0].text).toContain("complete");
		});

		it("blocks task completion on a high-severity review and refuses completion without a prover gate", async () => {
			const h = createToolHarness(cwd);
			const team = "team-e2e-block";
			await call(h, "team_start", { task: "force:E2E block team", teamId: team });
			await call(h, "team_create_task", { teamId: team, id: "task-a", title: "A", description: "do a" });
			await call(h, "team_spawn_task_agent", { teamId: team, taskId: "task-a" });
			await call(h, "team_record_review_gate", {
				teamId: team,
				taskId: "task-a",
				reviewReport: { max_severity: "high", needs_changes: true, summary: "broken" },
			});
			// High-severity needs_changes blocks completion.
			await expect(
				call(h, "team_transition_task", {
					teamId: team,
					taskId: "task-a",
					status: "completed",
					evidence: { summary: "done", recorded_by: "worker" },
				}),
			).rejects.toThrow(/review.*block|needs_changes|high/i);

			// Completion without a passing prover gate is refused.
			await expect(call(h, "team_complete", { teamId: team, phase: "complete" })).rejects.toThrow(
				/completion gate|evidence_matrix|prover/i,
			);
		});
	});
});
