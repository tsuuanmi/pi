import { execFileSync } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runWorkflowCommand } from "../../../src/commands/workflow.ts";
import { RuntimeOwner } from "../../../src/harness/runtime/owner.ts";
import type { HarnessRpc, RpcStateSnapshot } from "../../../src/harness/runtime/rpc.ts";
import { resolveHarnessRoot, sessionPaths, writeSessionState } from "../../../src/harness/runtime/storage.ts";
import { SESSION_SCHEMA_VERSION, type SessionState } from "../../../src/harness/runtime/types.ts";
import { readWorkflowActiveState, syncWorkflowActiveState } from "../../../src/harness/shared/active-state.ts";

class FakeRpc implements HarnessRpc {
	async getState(): Promise<RpcStateSnapshot> {
		return { isStreaming: false, steeringQueueDepth: 0, followupQueueDepth: 0 };
	}
	async sendPrompt(): Promise<{ commandId: string; ack: boolean }> {
		return { commandId: "fake-command", ack: true };
	}
	eventCursor(): number {
		return 0;
	}
	async waitForAgentStart(): Promise<{ cursor: number } | null> {
		return { cursor: 1 };
	}
	async close(): Promise<void> {}
	isLive(): boolean {
		return true;
	}
	lastFrameAt(): string | null {
		return null;
	}
}

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
		await syncWorkflowActiveState(
			cwd,
			{ skill: "deep-interview", active: true, phase: "interviewing" },
			{ sessionId },
		);

		const visible = await readWorkflowActiveState(cwd, { sessionId });
		expect(visible?.active).toBe(true);
		expect(visible?.active_workflows).toHaveLength(1);
		expect(visible?.active_workflows[0]).toMatchObject({
			skill: "deep-interview",
			active: true,
			phase: "interviewing",
			session_id: sessionId,
		});
	});

	it("HUD active-state for one session is not visible to a different session id", async () => {
		const sessionA = "hud-session-a";
		const sessionB = "hud-session-b";
		await syncWorkflowActiveState(
			cwd,
			{ skill: "deep-interview", active: true, phase: "interviewing" },
			{ sessionId: sessionA },
		);

		const visibleB = await readWorkflowActiveState(cwd, { sessionId: sessionB });
		expect(visibleB?.active_workflows ?? []).toHaveLength(0);

		const visibleA = await readWorkflowActiveState(cwd, { sessionId: sessionA });
		expect(visibleA?.active_workflows).toHaveLength(1);
		expect(visibleA?.active_workflows[0]?.session_id).toBe(sessionA);
	});

	it("subagents spawn fails closed with owner-not-live when no live owner exists", async () => {
		const sessionId = "spawn-fail-closed";
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
		const parsed = JSON.parse(result.stdout) as {
			ok: boolean;
			evidence: { accepted: boolean; action: string; reason: string };
		};
		expect(parsed.ok).toBe(false);
		expect(parsed.evidence.accepted).toBe(false);
		expect(parsed.evidence.action).toBe("spawn");
		expect(parsed.evidence.reason).toBe("owner-not-live");
	});

	it("subagents spawn without a session id fails closed with session_not_found", async () => {
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
		expect(result.stderr).toMatch(/sessionId is required/);
	});

	it("ralplan run-agent fails closed without a live current-session owner", async () => {
		const sessionId = "ralplan-no-owner";
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
					role: "planner",
					stage: "planner",
					stageN: 1,
					task: "plan",
					dryRun: true,
				}),
				"--json",
			],
			cwd,
		);
		expect(result.status).toBe(1);
	});

	it("a live owner for one session does not serve subagent spawn for a different session", async () => {
		const ownerSession = "owner-session";
		const otherSession = "other-session";
		await writeSessionState(root, makeState(cwd, ownerSession));
		await writeSessionState(root, makeState(cwd, otherSession));

		const rpc = new FakeRpc();
		const owner = new RuntimeOwner({ root, sessionId: ownerSession, rpc, heartbeatMs: 60_000 });
		await owner.start();
		try {
			const result = await runWorkflowCommand(
				[
					"subagents",
					"spawn",
					"--input",
					JSON.stringify({ workspace: cwd, sessionId: otherSession, prompt: "do work", agent: "worker" }),
					"--json",
				],
				cwd,
			);
			expect(result.status).toBe(1);
			const parsed = JSON.parse(result.stdout) as {
				ok: boolean;
				evidence: { accepted: boolean; reason: string };
			};
			expect(parsed.ok).toBe(false);
			expect(parsed.evidence.accepted).toBe(false);
			expect(parsed.evidence.reason).toBe("owner-not-live");
		} finally {
			await owner.stop();
		}
	});
});
