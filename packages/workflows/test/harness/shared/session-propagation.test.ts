import { execFileSync } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runWorkflowCommand } from "../../../src/commands/workflow.ts";
import { resolveHarnessRoot, sessionPaths, writeSessionState } from "../../../src/harness/runtime/storage.ts";
import { SESSION_SCHEMA_VERSION, type SessionState } from "../../../src/harness/runtime/types.ts";
import { readWorkflowActiveState, syncWorkflowActiveState } from "../../../src/harness/shared/active-state.ts";

function makeState(cwd: string, sessionId: string): SessionState {
	const root = resolveHarnessRoot({ cwd });
	const paths = sessionPaths(root, sessionId);
	const now = new Date().toISOString();
	return {
		schemaVersion: SESSION_SCHEMA_VERSION,
		sessionId,
		lifecycle: "started",
		harness: "pi",
		handle: {
			sessionId,
			harness: "pi",
			workspace: cwd,
			repo: null,
			branch: null,
			base: null,
			issueOrPr: null,
			processHandle: { kind: "runtime-owner", ownerId: null, pid: null },
			rpcHandle: { kind: "rpc-subprocess", pid: null, sessionDir: paths.piSessionDir },
			ownerHandle: { leasePath: paths.lease, endpoint: null, heartbeatAt: null },
			routerHandle: { kind: "default-in-owner", policy: "workflow-runtime", eventsPath: paths.events },
			viewportHandle: { kind: "event-monitor", tmuxSessionName: null, viewOnly: true },
			startedAt: now,
			updatedAt: now,
		},
		retries: {},
		blockers: [],
		createdAt: now,
		updatedAt: now,
	};
}

describe("current-session workflow propagation", () => {
	let cwd: string;
	let root: string;

	beforeEach(async () => {
		cwd = join(tmpdir(), `pi-session-prop-${Date.now()}-${Math.random().toString(36).slice(2)}`);
		await mkdir(cwd, { recursive: true });
		execFileSync("git", ["init"], { cwd, stdio: "ignore" });
		root = resolveHarnessRoot({ cwd });
	});

	afterEach(async () => {
		await rm(cwd, { recursive: true, force: true });
	});

	it("HUD active-state is written and read for the same session id", async () => {
		const sessionId = "hud-same-session";
		await writeSessionState(root, makeState(cwd, sessionId));
		await syncWorkflowActiveState(cwd, { skill: "ralplan", active: true, phase: "planner" }, { sessionId });
		const state = await readWorkflowActiveState(cwd, { sessionId });
		expect(state?.active_workflows.some((w) => w.skill === "ralplan" && w.session_id === sessionId)).toBe(true);
	});

	it("HUD active-state for one session is not visible to a different session id", async () => {
		const a = "hud-session-a";
		const b = "hud-session-b";
		await writeSessionState(root, makeState(cwd, a));
		await writeSessionState(root, makeState(cwd, b));
		await syncWorkflowActiveState(cwd, { skill: "ralplan", active: true, phase: "planner" }, { sessionId: a });
		const stateB = await readWorkflowActiveState(cwd, { sessionId: b });
		expect(stateB?.active_workflows?.some((w) => w.skill === "ralplan" && w.session_id === a)).toBeFalsy();
	});

	it("subagents spawn command is removed and errors toward the model-visible tool", async () => {
		const sessionId = "spawn-removed";
		await writeSessionState(root, makeState(cwd, sessionId));
		const result = await runWorkflowCommand(
			[
				"subagents",
				"spawn",
				"--input",
				JSON.stringify({ workspace: cwd, sessionId, prompt: "do work", agent: "worker" }),
				"--json",
			],
			cwd,
		);
		expect(result.status).toBe(1);
		expect(result.stderr).toMatch(/subagent_spawn/);
	});

	it("subagents spawn command errors with the tool-redirect message even without a session id", async () => {
		const result = await runWorkflowCommand(
			[
				"subagents",
				"spawn",
				"--input",
				JSON.stringify({ workspace: cwd, prompt: "do work", agent: "worker" }),
				"--json",
			],
			cwd,
		);
		expect(result.status).toBe(1);
		expect(result.stderr).toMatch(/subagent_spawn/);
	});

	it("ralplan run-agent command is removed and errors toward the model-visible tool", async () => {
		const sessionId = "run-agent-removed";
		await writeSessionState(root, makeState(cwd, sessionId));
		const result = await runWorkflowCommand(
			[
				"ralplan",
				"run-agent",
				"--input",
				JSON.stringify({
					workspace: cwd,
					sessionId,
					runId: "ralplan-prop-test",
					role: "architect",
					stage: "architect",
					stageN: 1,
					task: "plan",
					dryRun: true,
				}),
				"--json",
			],
			cwd,
		);
		expect(result.status).toBe(1);
		expect(result.stderr).toMatch(/ralplan_run_agent/);
	});

	it("team spawn-task-agent command is removed and errors toward the model-visible tool", async () => {
		const sessionId = "team-spawn-removed";
		await writeSessionState(root, makeState(cwd, sessionId));
		const result = await runWorkflowCommand(
			[
				"team",
				"spawn-task-agent",
				"--input",
				JSON.stringify({ workspace: cwd, sessionId, taskId: "t1", prompt: "do work" }),
				"--json",
			],
			cwd,
		);
		expect(result.status).toBe(1);
		expect(result.stderr).toMatch(/team_spawn_task_agent/);
	});

	it("ultragoal spawn-goal-agent command is removed and errors toward the model-visible tool", async () => {
		const sessionId = "ultragoal-spawn-removed";
		await writeSessionState(root, makeState(cwd, sessionId));
		const result = await runWorkflowCommand(
			[
				"ultragoal",
				"spawn-goal-agent",
				"--input",
				JSON.stringify({ workspace: cwd, sessionId, goalId: "g1", prompt: "do work" }),
				"--json",
			],
			cwd,
		);
		expect(result.status).toBe(1);
		expect(result.stderr).toMatch(/ultragoal_spawn_goal_agent/);
	});
});
