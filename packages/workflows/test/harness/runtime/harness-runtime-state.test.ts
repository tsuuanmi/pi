import { execFileSync } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	clearSubagentManagerFactoryForTests,
	registerSubagentManagerFactory,
	type SubagentManager,
} from "@tsuuanmi/pi-agent";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runWorkflowCommand } from "../../../src/commands/workflow.ts";
import { RuntimeOwner } from "../../../src/harness/runtime/owner.ts";
import {
	buildClassificationInput,
	classifyRecovery,
	isRuntimeReceiptValid,
} from "../../../src/harness/runtime/primitives.ts";
import type { HarnessRpc, RpcStateSnapshot } from "../../../src/harness/runtime/rpc.ts";
import {
	readRuntimeReceipts,
	readSessionState,
	resolveHarnessRoot,
	sessionPaths,
	writeSessionState,
} from "../../../src/harness/runtime/storage.ts";
import { SESSION_SCHEMA_VERSION, type SessionState } from "../../../src/harness/runtime/types.ts";

class FakeRpc implements HarnessRpc {
	started = false;

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
		this.started = true;
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

function makeState(cwd: string, sessionId = "h-phase1"): SessionState {
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

describe("harness control-plane phase 1", () => {
	let cwd: string;
	let root: string;
	const sessionId = "h-phase1";

	beforeEach(async () => {
		cwd = join(tmpdir(), `pi-harness-phase1-${Date.now()}-${Math.random().toString(36).slice(2)}`);
		await mkdir(cwd, { recursive: true });
		execFileSync("git", ["init"], { cwd, stdio: "ignore" });
		root = resolveHarnessRoot({ cwd });
		await writeSessionState(root, makeState(cwd, sessionId));
	});

	afterEach(async () => {
		clearSubagentManagerFactoryForTests();
		await rm(cwd, { recursive: true, force: true });
	});

	it("classifies without mutating state or receipts", async () => {
		const before = await readSessionState(root, sessionId);
		const result = await runWorkflowCommand(
			["classify", "--input", JSON.stringify({ workspace: cwd, sessionId }), "--json"],
			cwd,
		);
		expect(result.status).toBe(0);
		const parsed = JSON.parse(result.stdout) as { ok: boolean; evidence: { decision: { classification: string } } };
		expect(parsed.ok).toBe(true);
		expect(parsed.evidence.decision.classification).toBe("restart-clean");
		expect(parsed.evidence.decision.classification).not.toBe("respawn-owner");
		expect(await readSessionState(root, sessionId)).toEqual(before);
		expect((await readRuntimeReceipts(root, sessionId)).rows).toHaveLength(0);
	});

	it("classifies dirty owner-vanished workspace as restart-preserve-delta, never restart-clean", async () => {
		await writeFile(join(cwd, "dirty.txt"), "dirty", "utf8");
		const result = await runWorkflowCommand(
			["classify", "--input", JSON.stringify({ workspace: cwd, sessionId }), "--json"],
			cwd,
		);
		expect(result.status).toBe(0);
		const parsed = JSON.parse(result.stdout) as {
			ok: boolean;
			evidence: { decision: { classification: string; blocked: boolean } };
		};
		expect(parsed.ok).toBe(true);
		expect(parsed.evidence.decision.classification).toBe("restart-preserve-delta");
		expect(parsed.evidence.decision.classification).not.toBe("restart-clean");
		expect(parsed.evidence.decision.blocked).toBe(false);
		expect((await readRuntimeReceipts(root, sessionId)).rows).toHaveLength(0);
	});

	it("validates checks, writes a receipt, and finalizes with fresh evidence", async () => {
		const validation = await runWorkflowCommand(
			[
				"validate",
				"--input",
				JSON.stringify({ workspace: cwd, sessionId, checks: [{ name: "ok", command: "true" }] }),
				"--json",
			],
			cwd,
		);
		expect(validation.status).toBe(0);
		const receipts = await readRuntimeReceipts(root, sessionId);
		expect(receipts.rows.some((receipt) => receipt.verb === "validate" && isRuntimeReceiptValid(receipt))).toBe(true);

		const finalized = await runWorkflowCommand(
			["finalize", "--input", JSON.stringify({ workspace: cwd, sessionId }), "--json"],
			cwd,
		);
		expect(finalized.status).toBe(0);
		const parsed = JSON.parse(finalized.stdout) as { state: { lifecycle: string }; evidence: { completed: boolean } };
		expect(parsed.state.lifecycle).toBe("completed");
		expect(parsed.evidence.completed).toBe(true);
	});

	it("fails closed when skill finalization lacks a terminal detector", async () => {
		const skillSessionId = "h-skill-terminal";
		await writeSessionState(root, makeState(cwd, skillSessionId));
		const validation = await runWorkflowCommand(
			[
				"validate",
				"--input",
				JSON.stringify({ workspace: cwd, sessionId: skillSessionId, checks: [{ name: "ok", command: "true" }] }),
				"--json",
			],
			cwd,
		);
		expect(validation.status).toBe(0);

		const blocked = await runWorkflowCommand(
			[
				"finalize",
				"--input",
				JSON.stringify({ workspace: cwd, sessionId: skillSessionId, skill: "ralplan" }),
				"--json",
			],
			cwd,
		);
		expect(blocked.status).toBe(1);
		const parsed = JSON.parse(blocked.stdout) as { state: { lifecycle: string }; evidence: { blockers: string[] } };
		expect(parsed.state.lifecycle).toBe("blocked");
		expect(parsed.evidence.blockers).toContain("terminal-detector-missing:ralplan-final-artifact-receipt");
	});

	it("allows skill finalization when terminal detector evidence is explicit", async () => {
		const skillSessionId = "h-skill-terminal-ok";
		await writeSessionState(root, makeState(cwd, skillSessionId));
		const validation = await runWorkflowCommand(
			[
				"validate",
				"--input",
				JSON.stringify({ workspace: cwd, sessionId: skillSessionId, checks: [{ name: "ok", command: "true" }] }),
				"--json",
			],
			cwd,
		);
		expect(validation.status).toBe(0);

		const finalized = await runWorkflowCommand(
			[
				"finalize",
				"--input",
				JSON.stringify({
					workspace: cwd,
					sessionId: skillSessionId,
					skill: "ralplan",
					terminalDetectorIds: ["ralplan-final-artifact-receipt"],
				}),
				"--json",
			],
			cwd,
		);
		expect(finalized.status).toBe(0);
		const parsed = JSON.parse(finalized.stdout) as {
			state: { lifecycle: string };
			evidence: { terminalMatched: string[] };
		};
		expect(parsed.state.lifecycle).toBe("completed");
		expect(parsed.evidence.terminalMatched).toContain("ralplan-final-artifact-receipt");
	});

	it("routes new verbs to a live owner", async () => {
		const rpc = new FakeRpc();
		const owner = new RuntimeOwner({ root, sessionId, rpc, heartbeatMs: 60_000 });
		await owner.start();
		try {
			const result = await runWorkflowCommand(
				["classify", "--input", JSON.stringify({ workspace: cwd, sessionId }), "--json"],
				cwd,
			);
			expect(result.status).toBe(0);
			const parsed = JSON.parse(result.stdout) as { evidence: { ownerRouted?: boolean } };
			expect(parsed.evidence.ownerRouted).toBe(true);
		} finally {
			await owner.stop();
		}
	});

	it("fails validation with bounded evidence and nonzero status", async () => {
		const result = await runWorkflowCommand(
			[
				"validate",
				"--input",
				JSON.stringify({ workspace: cwd, sessionId, checks: [{ name: "bad", command: "printf nope; exit 2" }] }),
				"--json",
			],
			cwd,
		);
		expect(result.status).toBe(1);
		const parsed = JSON.parse(result.stdout) as {
			ok: boolean;
			evidence: { validation: { checks: Array<{ exitCode: number; stdoutSummary: string; passed: boolean }> } };
		};
		expect(parsed.ok).toBe(false);
		expect(parsed.evidence.validation.checks[0]).toMatchObject({ exitCode: 2, stdoutSummary: "nope", passed: false });
	});

	it("classifier handles prompt-not-accepted and validation budget cases", async () => {
		const state = makeState(cwd, "h-pure");
		const promptInput = await buildClassificationInput({
			state,
			ownerLive: true,
			input: { signals: ["no-agent-start-within-timeout"] },
		});
		expect(classifyRecovery(promptInput).classification).toBe("reinject-prompt");
		const exhausted = await buildClassificationInput({
			state: { ...state, retries: { reinjectPrompt: 2 } },
			ownerLive: true,
			input: { signals: ["no-ack"] },
		});
		expect(classifyRecovery(exhausted)).toMatchObject({
			classification: "blocked",
			reason: "reinject-prompt-budget-exhausted",
		});
		const validation = await buildClassificationInput({
			state,
			ownerLive: true,
			input: { signals: ["validation-failed"] },
		});
		expect(classifyRecovery(validation).classification).toBe("continue");
		expect(classifyRecovery(validation).classification).not.toBe("validation-repair");
	});

	it("routes pi workflow subagents spawn through the owner to the SubagentManager and forces storageSessionId", async () => {
		const calls: { method: string; storageSessionId?: string }[] = [];
		const manager = {
			spawn: async (req: Record<string, unknown>) => {
				calls.push({ method: "spawn", storageSessionId: req.storageSessionId as string | undefined });
				return { ok: true, record: { id: "sub-owner-test", status: "running" } } as never;
			},
			resume: async () => ({ ok: true }) as never,
			steer: async () => ({ ok: true }) as never,
			pause: async () => ({ ok: true }) as never,
			cancel: async (id: string) => ({ id, status: "cancelled" }) as never,
			read: async () => ({ id: "sub-owner-test", status: "running" }) as never,
			list: async () => {
				calls.push({ method: "list" });
				return [{ id: "sub-owner-test", status: "running" }] as never;
			},
			waitFor: async () => ({ ok: true, record: { id: "sub-owner-test", status: "completed" } }) as never,
			dispose: async () => {
				calls.push({ method: "dispose" });
			},
		} as unknown as SubagentManager;
		registerSubagentManagerFactory(() => manager);
		const rpc = new FakeRpc();
		const owner = new RuntimeOwner({ root, sessionId, rpc, heartbeatMs: 60_000 });
		await owner.start();
		try {
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
			expect(result.status).toBe(0);
			expect(calls.some((c) => c.method === "spawn")).toBe(true);
			expect(calls.find((c) => c.method === "spawn")?.storageSessionId).toBe(sessionId);

			const status = await runWorkflowCommand(
				["subagents", "status", "--input", JSON.stringify({ workspace: cwd, sessionId }), "--json"],
				cwd,
			);
			expect(status.status).toBe(0);
			expect(JSON.parse(status.stdout)).toMatchObject({ ok: true, records: [{ id: "sub-owner-test" }] });
			expect(calls.some((c) => c.method === "list")).toBe(true);
		} finally {
			await owner.stop();
		}
		expect(calls.some((c) => c.method === "dispose")).toBe(true);
	});

	it("subagents verbs fail closed when no SubagentManagerFactory is registered", async () => {
		const rpc = new FakeRpc();
		const owner = new RuntimeOwner({ root, sessionId, rpc, heartbeatMs: 60_000 });
		await owner.start();
		try {
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
			expect(result.stdout).toMatch(/no subagent manager/);
		} finally {
			await owner.stop();
		}
	});
});
