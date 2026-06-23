import { execFileSync } from "node:child_process";
import { appendFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runWorkflowCommand } from "../../src/cli/workflow-command.ts";
import { preserveDirtyWorktree } from "../../src/harness-runtime/preservation.ts";
import {
	buildClassificationInput,
	buildWorkspaceMarker,
	type ClassificationInput,
	classifyRecovery,
	consumeBudget,
	isRuntimeReceiptValid,
	type RecoveryDecision,
	recoverPrimitive,
} from "../../src/harness-runtime/primitives.ts";
import type { HarnessRpc, RpcStateSnapshot } from "../../src/harness-runtime/rpc.ts";
import { operate } from "../../src/harness-runtime/runner.ts";
import {
	readRuntimeReceipts,
	readSessionState,
	resolveHarnessRoot,
	sessionPaths,
	writeSessionState,
} from "../../src/harness-runtime/storage.ts";
import { SESSION_SCHEMA_VERSION, type SessionState } from "../../src/harness-runtime/types.ts";
import { buildVanishEvidence, requiresVanishBeforeAction, validateVanish } from "../../src/harness-runtime/vanish.ts";

const WRITER = { ownerId: "test", leaseEpoch: 0 };

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

function git(cwd: string, args: string[]): string {
	return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
}

function makeState(cwd: string, sessionId: string, base: string | null): SessionState {
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
			base,
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

async function setupRepo(cwd: string, sessionId: string): Promise<{ root: string; base: string; state: SessionState }> {
	execFileSync("git", ["init"], { cwd, stdio: "ignore" });
	execFileSync("git", ["config", "user.email", "t@t"], { cwd, stdio: "ignore" });
	execFileSync("git", ["config", "user.name", "t"], { cwd, stdio: "ignore" });
	await writeFile(join(cwd, "file.txt"), "initial\n", "utf8");
	execFileSync("git", ["add", "file.txt"], { cwd, stdio: "ignore" });
	execFileSync("git", ["commit", "-m", "init"], { cwd, stdio: "ignore" });
	const base = git(cwd, ["rev-parse", "HEAD"]);
	const root = resolveHarnessRoot({ cwd });
	const state = makeState(cwd, sessionId, base);
	await writeSessionState(root, state);
	return { root, base, state };
}

async function classificationInput(
	state: SessionState,
	root: string,
	sessionId: string,
	ownerLive = false,
): Promise<ClassificationInput> {
	const receipts = await readRuntimeReceipts(root, sessionId);
	return buildClassificationInput({ state, ownerLive, receipts: receipts.rows });
}

describe("harness control-plane phase 2 — preserve + vanish", () => {
	let cwd: string;
	const sessionId = "h-phase2-pv";

	beforeEach(async () => {
		cwd = join(tmpdir(), `pi-harness-phase2-${Date.now()}-${Math.random().toString(36).slice(2)}`);
		await mkdir(cwd, { recursive: true });
		await setupRepo(cwd, sessionId);
	});

	afterEach(async () => {
		await rm(cwd, { recursive: true, force: true });
	});

	it("preserveDirtyWorktree is non-mutating and captures a stashed snapshot of tracked changes", async () => {
		await writeFile(join(cwd, "file.txt"), "changed\n", "utf8");
		const before = await readFile(join(cwd, "file.txt"), "utf8");
		const result = preserveDirtyWorktree(cwd);
		expect(result.gitDelta).toBe("dirty");
		expect(result.stashRef).not.toBeNull();
		expect(result.snapshotComplete).toBe(true);
		// non-mutating: the working tree is untouched (no reset/clean/checkout).
		expect(await readFile(join(cwd, "file.txt"), "utf8")).toBe(before);
		// trackedDiffSha256 matches `git diff HEAD`.
		const expected = git(cwd, ["diff", "HEAD", "--", ".", ":!.pi"]);
		expect(result.trackedDiff).toBe(expected);
		// stash ref is a real commit object.
		expect(() => git(cwd, ["cat-file", "-t", result.stashRef as string])).not.toThrow();
	});

	it("preserveDirtyWorktree on a clean tree returns empty evidence (safe no-op)", async () => {
		const result = preserveDirtyWorktree(cwd);
		expect(result.gitDelta).toBe("clean");
		expect(result.untrackedManifest).toEqual([]);
		expect(result.stashRef).toBeNull();
		expect(result.snapshotComplete).toBe(true);
	});

	it("vanish evidence content-hash is fail-closed: tampered hash/evidence is invalid", async () => {
		await writeFile(join(cwd, "file.txt"), "dirty tracked change\n", "utf8");
		const preserve = preserveDirtyWorktree(cwd);
		const evidence = buildVanishEvidence("dirty", preserve, "restart-preserve-delta");
		// valid evidence validates.
		expect(validateVanish(evidence).valid).toBe(true);
		// tampered snapshotComplete -> invalid (fail-closed).
		const tampered = { ...evidence, snapshotComplete: false };
		expect(validateVanish(tampered).valid).toBe(false);
		// dirty without forbidden clean -> invalid.
		const noForbidden = { ...evidence, forbiddenActions: [] };
		expect(validateVanish(noForbidden).valid).toBe(false);
		// dirty keeping restart-clean but dropping delete/reset -> invalid (Gajae-style all-three guard).
		const missingDelete = { ...evidence, forbiddenActions: ["restart-clean", "reset"] };
		expect(validateVanish(missingDelete).valid).toBe(false);
		const missingReset = { ...evidence, forbiddenActions: ["restart-clean", "delete"] };
		expect(validateVanish(missingReset).valid).toBe(false);
		// dirty classified restart-clean -> invalid (dirty never clean-restarted).
		const cleanRestart = { ...evidence, classification: "restart-clean" };
		expect(validateVanish(cleanRestart).valid).toBe(false);
		// unknown classification -> invalid.
		expect(validateVanish({ ...evidence, classification: "bogus" }).valid).toBe(false);
		// requiresVanishBeforeAction covers exactly the destructive kinds.
		expect(requiresVanishBeforeAction("restart-clean")).toBe(true);
		expect(requiresVanishBeforeAction("restart-preserve-delta")).toBe(true);
		expect(requiresVanishBeforeAction("fallback-harness-exec")).toBe(true);
		expect(requiresVanishBeforeAction("continue")).toBe(false);
	});

	it("clean/zero-delta vanish evidence carries empty preservation (uniform gate)", async () => {
		const preserve = preserveDirtyWorktree(cwd);
		const clean = buildVanishEvidence("clean", preserve, "restart-clean");
		expect(clean.untrackedManifest).toEqual([]);
		expect(clean.stashRef).toBeNull();
		expect(clean.snapshotComplete).toBe(true);
		expect(clean.forbiddenActions).toEqual([]);
		expect(validateVanish(clean).valid).toBe(true);
		const zero = buildVanishEvidence("zero-delta", preserve, "restart-clean");
		expect(validateVanish(zero).valid).toBe(true);
	});
});

describe("harness control-plane phase 2 — destructive recovery (recoverPrimitive)", () => {
	let cwd: string;
	let root: string;
	const sessionId = "h-phase2-rec";

	beforeEach(async () => {
		cwd = join(tmpdir(), `pi-harness-phase2-rec-${Date.now()}-${Math.random().toString(36).slice(2)}`);
		await mkdir(cwd, { recursive: true });
		const setup = await setupRepo(cwd, sessionId);
		root = setup.root;
	});

	afterEach(async () => {
		await rm(cwd, { recursive: true, force: true });
	});

	async function recover(opts: {
		state: SessionState | null;
		spawnOwner?: () => Promise<boolean>;
		input?: Record<string, unknown>;
	}) {
		if (!opts.state) throw new Error(`recover: state not found for ${sessionId}`);
		return recoverPrimitive({
			root,
			state: opts.state,
			ownerLive: false,
			input: opts.input ?? {},
			writer: WRITER,
			spawnOwner: opts.spawnOwner ?? (async () => true),
			receipts: (await readRuntimeReceipts(root, sessionId)).rows,
		});
	}

	it("clean owner-vanished -> restart-clean, vanish-gated, no budget consumed on clean", async () => {
		const state = await readSessionState(root, sessionId);
		const res = await recover({ state });
		const decision = (res.evidence as { decision: RecoveryDecision }).decision;
		expect(decision.classification).toBe("restart-clean");
		expect(res.ok).toBe(true);
		expect(typeof (res.evidence as { vanishReceiptId?: string }).vanishReceiptId).toBe("string");
		const after = await readSessionState(root, sessionId);
		expect(after?.retries.zeroDeltaVanish).toBeUndefined(); // clean consumes nothing
		// a vanish receipt was written + is valid.
		const receipts = await readRuntimeReceipts(root, sessionId);
		const vanish = receipts.rows.find((r) => r.verb === "vanish");
		expect(vanish && isRuntimeReceiptValid(vanish)).toBe(true);
	});

	it("zero-delta + budget -> restart-clean consuming zeroDeltaVanish", async () => {
		// advance HEAD past base with no working-tree change -> zero-delta.
		await writeFile(join(cwd, "file.txt"), "changed\n", "utf8");
		execFileSync("git", ["add", "file.txt"], { cwd, stdio: "ignore" });
		execFileSync("git", ["commit", "-m", "c2"], { cwd, stdio: "ignore" });
		const state = await readSessionState(root, sessionId);
		const marker = buildWorkspaceMarker(cwd, state?.handle.base ?? null);
		expect(marker.gitDelta).toBe("zero-delta");
		const res = await recover({ state: state as SessionState });
		const decision = (res.evidence as { decision: RecoveryDecision }).decision;
		expect(decision.classification).toBe("restart-clean");
		expect(res.ok).toBe(true);
		const after = await readSessionState(root, sessionId);
		expect(after?.retries.zeroDeltaVanish).toBe(1);
	});

	it("zero-delta budget exhausted -> fallback-harness-exec blocked", async () => {
		await writeFile(join(cwd, "file.txt"), "changed\n", "utf8");
		execFileSync("git", ["add", "file.txt"], { cwd, stdio: "ignore" });
		execFileSync("git", ["commit", "-m", "c2"], { cwd, stdio: "ignore" });
		const state = await readSessionState(root, sessionId);
		// pre-consume the single zeroDeltaVanish budget.
		const exhausted = { ...state, retries: { zeroDeltaVanish: 1 } } as SessionState;
		await writeSessionState(root, exhausted);
		const res = await recover({ state: exhausted });
		const decision = (res.evidence as { decision: RecoveryDecision }).decision;
		expect(decision.classification).toBe("fallback-harness-exec");
		expect(res.ok).toBe(false);
		expect((res.evidence as { reason?: string }).reason).toBe("fallback-harness-exec-requested");
		// fallback still writes a vanish receipt (uniform gate) but never executes a cross-harness exec.
		expect(typeof (res.evidence as { vanishReceiptId?: string }).vanishReceiptId).toBe("string");
	});

	it("dirty + budget -> restart-preserve-delta with stash vanish; dirty never restart-clean", async () => {
		await writeFile(join(cwd, "file.txt"), "dirty tracked change\n", "utf8");
		const state = (await readSessionState(root, sessionId)) as SessionState;
		const input = await classificationInput(state, root, sessionId, false);
		const decision = classifyRecovery(input);
		expect(decision.classification).toBe("restart-preserve-delta");
		expect(decision.classification).not.toBe("restart-clean");
		const res = await recover({ state });
		expect(res.ok).toBe(true);
		expect((res.evidence as { decision: RecoveryDecision }).decision.classification).toBe("restart-preserve-delta");
		expect(typeof (res.evidence as { vanishReceiptId?: string }).vanishReceiptId).toBe("string");
		const after = await readSessionState(root, sessionId);
		expect(after?.retries.dirtyVanishPreserve).toBe(1);
		// the vanish receipt recorded a stash ref (real preservation).
		const receipts = await readRuntimeReceipts(root, sessionId);
		const vanish = receipts.rows.find((r) => r.verb === "vanish");
		const vanishEv = vanish?.evidence as { stashRef?: string | null } | undefined;
		expect(vanishEv?.stashRef).not.toBeNull();
	});

	it("dirty budget exhausted -> fallback-harness-exec blocked (no spawn called)", async () => {
		await writeFile(join(cwd, "file.txt"), "dirty tracked change\n", "utf8");
		const state = await readSessionState(root, sessionId);
		const exhausted = { ...state, retries: { dirtyVanishPreserve: 1 } } as SessionState;
		await writeSessionState(root, exhausted);
		let spawned = false;
		const res = await recover({
			state: exhausted,
			spawnOwner: async () => {
				spawned = true;
				return true;
			},
		});
		expect(res.ok).toBe(false);
		expect((res.evidence as { decision: RecoveryDecision }).decision.classification).toBe("fallback-harness-exec");
		expect(spawned).toBe(false); // no cross-harness exec / respawn on fallback
	});

	it("unknown / not-git delta -> human-check blocked (never destructive)", async () => {
		const nonGit = join(tmpdir(), `pi-nogit-${Date.now()}`);
		await mkdir(nonGit, { recursive: true });
		try {
			const ngState = makeState(nonGit, sessionId, null);
			await writeSessionState(root, ngState);
			const res = await recoverPrimitive({
				root,
				state: ngState,
				ownerLive: false,
				writer: WRITER,
				spawnOwner: async () => true,
				receipts: (await readRuntimeReceipts(root, sessionId)).rows,
			});
			const decision = (res.evidence as { decision: RecoveryDecision }).decision;
			expect(decision.classification).toBe("human-check");
			expect(res.ok).toBe(false);
		} finally {
			await rm(nonGit, { recursive: true, force: true });
		}
	});

	it("no-commit + dirty worktree cannot be stashed -> invalid vanish -> block (fail-closed)", async () => {
		const fresh = join(tmpdir(), `pi-nocommit-${Date.now()}`);
		await mkdir(fresh, { recursive: true });
		try {
			execFileSync("git", ["init"], { cwd: fresh, stdio: "ignore" });
			await writeFile(join(fresh, "untracked.txt"), "x", "utf8");
			const fState = makeState(fresh, sessionId, null);
			await writeSessionState(root, fState);
			const res = await recoverPrimitive({
				root,
				state: fState,
				ownerLive: false,
				writer: WRITER,
				spawnOwner: async () => true,
				receipts: (await readRuntimeReceipts(root, sessionId)).rows,
			});
			// dirty + budget -> restart-preserve-delta, but stash impossible -> vanish invalid -> blocked.
			expect(res.ok).toBe(false);
			expect((res.evidence as { reason?: string }).reason).toBe("invalid-vanish-receipt");
		} finally {
			await rm(fresh, { recursive: true, force: true });
		}
	});

	it("tamper-on-disk: corrupt receipt log blocks recovery (the gap mutateRuntimeSession does not catch)", async () => {
		await writeFile(join(cwd, "file.txt"), "dirty tracked change\n", "utf8");
		const state = (await readSessionState(root, sessionId)) as SessionState;
		// pre-corrupt the receipts log with a malformed line.
		const paths = sessionPaths(root, sessionId);
		await appendFile(paths.receipts, "{not valid json\n", "utf8");
		const res = await recover({ state });
		expect(res.ok).toBe(false);
		expect((res.evidence as { reason?: string }).reason).toBe("invalid-vanish-receipt");
	});

	it("missing spawnOwner proof -> restart blocked without consuming budget", async () => {
		const state = (await readSessionState(root, sessionId)) as SessionState;
		const res = await recover({ state, spawnOwner: async () => false });
		expect(res.ok).toBe(false);
		expect((res.evidence as { reason?: string }).reason).toBe("owner-liveness-proof-failed");
		const after = await readSessionState(root, sessionId);
		expect(after?.retries.zeroDeltaVanish).toBeUndefined();
	});

	it("edge: concurrent recover calls on same session serialize via the file lock (single-writer, no corrupt receipt log)", async () => {
		const state = (await readSessionState(root, sessionId)) as SessionState;
		// Two concurrent clean -> restart-clean recovers on the same session. Both must serialize
		// through withFileMutationQueue so the receipt log is never corrupted by interleaved
		// appends and each call writes exactly one vanish receipt (no lost/duplicated writes).
		const [a, b] = await Promise.all([
			recover({ state, spawnOwner: async () => true }),
			recover({ state, spawnOwner: async () => true }),
		]);
		expect(a.ok).toBe(true);
		expect(b.ok).toBe(true);
		const log = await readRuntimeReceipts(root, sessionId);
		expect(log.diagnostics).toHaveLength(0);
		const vanish = log.rows.filter((r) => r.verb === "vanish");
		expect(vanish).toHaveLength(2);
		expect(vanish.every((r) => isRuntimeReceiptValid(r))).toBe(true);
	});
});

describe("harness control-plane phase 2 — operate loop (fake harness e2e)", () => {
	let cwd: string;
	let root: string;
	const sessionId = "h-phase2-ope";

	beforeEach(async () => {
		cwd = join(tmpdir(), `pi-harness-phase2-ope-${Date.now()}-${Math.random().toString(36).slice(2)}`);
		await mkdir(cwd, { recursive: true });
		const setup = await setupRepo(cwd, sessionId);
		root = setup.root;
	});

	afterEach(async () => {
		await rm(cwd, { recursive: true, force: true });
	});

	async function validatePassing() {
		await runWorkflowCommand(
			[
				"validate",
				"--input",
				JSON.stringify({ workspace: cwd, sessionId, checks: [{ name: "ok", command: "true" }] }),
				"--json",
			],
			cwd,
		);
	}

	it("AC3: completion via observed 'completed' signal -> finalize -> completed", async () => {
		await validatePassing();
		const rpc = new FakeRpc();
		const result = await operate({
			root,
			sessionId,
			goal: "do the work",
			ownerLive: true,
			writer: WRITER,
			rpc,
			spawnOwner: async () => true,
			maxIterations: 5,
			observe: async (st) =>
				buildClassificationInput({
					state: st,
					ownerLive: true,
					rpc,
					input: { signals: ["completed"] },
					receipts: (await readRuntimeReceipts(root, sessionId)).rows,
				}),
		});
		expect(result.completed).toBe(true);
		expect(result.lifecycle).toBe("completed");
		expect(result.iterations).toBe(1);
	});

	it("AC3: completion via finalizing lifecycle -> finalize -> completed", async () => {
		await validatePassing();
		const state = (await readSessionState(root, sessionId)) as SessionState;
		// An external driver already moved the session to finalizing; the loop must honor that
		// persisted lifecycle and finalize without an observed 'completed' signal.
		await writeSessionState(root, { ...state, lifecycle: "finalizing" });
		const rpc = new FakeRpc();
		const result = await operate({
			root,
			sessionId,
			goal: "do the work",
			ownerLive: true,
			writer: WRITER,
			rpc,
			spawnOwner: async () => true,
			maxIterations: 5,
			observe: async (st) =>
				buildClassificationInput({
					state: st,
					ownerLive: true,
					rpc,
					receipts: (await readRuntimeReceipts(root, sessionId)).rows,
				}),
		});
		expect(result.completed).toBe(true);
		expect(result.lifecycle).toBe("completed");
		expect(result.iterations).toBe(1);
	});

	it("AC3 B3: loop exhaustion never finalizes -> blocked no-observed-completion", async () => {
		const rpc = new FakeRpc();
		const result = await operate({
			root,
			sessionId,
			goal: "never done",
			ownerLive: true,
			writer: WRITER,
			rpc,
			spawnOwner: async () => true,
			maxIterations: 3,
			observe: async (st) =>
				buildClassificationInput({
					state: st,
					ownerLive: true,
					rpc,
					receipts: (await readRuntimeReceipts(root, sessionId)).rows,
				}),
		});
		expect(result.completed).toBe(false);
		expect(result.lifecycle).toBe("blocked");
		expect(result.blockers).toContain("no-observed-completion");
		expect(result.iterations).toBe(3);
	});

	it("AC3: budget exhaustion -> block (dirty: restart-preserve-delta then fallback-harness-exec)", async () => {
		await writeFile(join(cwd, "file.txt"), "dirty tracked change\n", "utf8");
		const rpc = new FakeRpc();
		const result = await operate({
			root,
			sessionId,
			goal: "do the work",
			ownerLive: false,
			writer: WRITER,
			rpc,
			spawnOwner: async () => true,
			maxIterations: 5,
			observe: async (st) =>
				buildClassificationInput({
					state: st,
					ownerLive: false,
					receipts: (await readRuntimeReceipts(root, sessionId)).rows,
				}),
		});
		expect(result.completed).toBe(false);
		expect(result.lifecycle).toBe("blocked");
		expect(result.classifications).toContain("restart-preserve-delta");
		expect(result.classifications).toContain("fallback-harness-exec");
		// a vanish receipt was written before each destructive action.
		expect(result.vanishReceiptIds.length).toBeGreaterThanOrEqual(1);
	});

	it("AC4: operate reuses the shared recoverPrimitive (spy/counter)", async () => {
		const rpc = new FakeRpc();
		let calls = 0;
		const spy = async (opts: Parameters<typeof recoverPrimitive>[0]) => {
			calls++;
			return recoverPrimitive(opts);
		};
		await operate({
			root,
			sessionId,
			goal: "do the work",
			ownerLive: true,
			writer: WRITER,
			rpc,
			spawnOwner: async () => true,
			maxIterations: 3,
			recover: spy,
			observe: async (st) =>
				buildClassificationInput({
					state: st,
					ownerLive: true,
					rpc,
					input: { signals: ["completed"] },
					receipts: (await readRuntimeReceipts(root, sessionId)).rows,
				}),
		});
		// completion is observed before any recover call, so the spy is not hit on the success path;
		// verify the spy wiring by running a non-completing loop and asserting it IS called.
		let calls2 = 0;
		const spy2 = async (opts: Parameters<typeof recoverPrimitive>[0]) => {
			calls2++;
			return recoverPrimitive(opts);
		};
		const result = await operate({
			root,
			sessionId,
			goal: "do the work",
			ownerLive: true,
			writer: WRITER,
			rpc,
			spawnOwner: async () => true,
			maxIterations: 2,
			recover: spy2,
			observe: async (st) =>
				buildClassificationInput({
					state: st,
					ownerLive: true,
					rpc,
					receipts: (await readRuntimeReceipts(root, sessionId)).rows,
				}),
		});
		expect(calls2).toBe(2);
		expect(result.completed).toBe(false);
		expect(result.blockers).toContain("no-observed-completion");
		// counter unused on the completion-first path; the wiring is verified via calls2.
		expect(calls).toBe(0);
	});

	it("AC5: fallback-harness-exec resolves to blocked with no real cross-harness exec", async () => {
		await writeFile(join(cwd, "file.txt"), "dirty tracked change\n", "utf8");
		const state = (await readSessionState(root, sessionId)) as SessionState;
		await writeSessionState(root, { ...state, retries: { dirtyVanishPreserve: 1 } });
		const res = await recoverPrimitive({
			root,
			state: { ...state, retries: { dirtyVanishPreserve: 1 } },
			ownerLive: false,
			writer: WRITER,
			spawnOwner: async () => true,
			receipts: (await readRuntimeReceipts(root, sessionId)).rows,
		});
		expect(res.ok).toBe(false);
		const decision = (res.evidence as { decision: RecoveryDecision }).decision;
		expect(decision.classification).toBe("fallback-harness-exec");
		expect((res.evidence as { reason?: string }).reason).toBe("fallback-harness-exec-requested");
		expect(res.state.lifecycle).toBe("blocked");
	});

	it("edge: operate on a completed session blocks immediately (no submit, no finalize)", async () => {
		const state = (await readSessionState(root, sessionId)) as SessionState;
		await writeSessionState(root, { ...state, lifecycle: "completed" });
		let submitted = false;
		const rpc = new FakeRpc();
		const result = await operate({
			root,
			sessionId,
			goal: "x",
			ownerLive: true,
			writer: WRITER,
			rpc,
			spawnOwner: async () => true,
			maxIterations: 3,
			observe: async (st) =>
				buildClassificationInput({
					state: st,
					ownerLive: true,
					rpc,
					receipts: (await readRuntimeReceipts(root, sessionId)).rows,
				}),
		});
		// singleFlightAccept would mark submitted; detect via rpc.started flag.
		submitted = rpc.started;
		expect(result.completed).toBe(false);
		expect(result.lifecycle).toBe("blocked");
		expect(result.iterations).toBe(0);
		expect(submitted).toBe(false);
	});

	it("edge: maxIterations=0 blocks without finalizing (loop body never runs)", async () => {
		const rpc = new FakeRpc();
		const result = await operate({
			root,
			sessionId,
			goal: "x",
			ownerLive: true,
			writer: WRITER,
			rpc,
			spawnOwner: async () => true,
			maxIterations: 0,
			observe: async (st) =>
				buildClassificationInput({
					state: st,
					ownerLive: true,
					rpc,
					receipts: (await readRuntimeReceipts(root, sessionId)).rows,
				}),
		});
		expect(result.completed).toBe(false);
		expect(result.lifecycle).toBe("blocked");
		expect(result.blockers).toContain("no-observed-completion");
		expect(result.iterations).toBe(0);
	});

	it("edge: base=null legacy session -> clean (not zero-delta)", async () => {
		const state = (await readSessionState(root, sessionId)) as SessionState;
		await writeSessionState(root, { ...state, handle: { ...state.handle, base: null } });
		const marker = buildWorkspaceMarker(cwd, null);
		expect(marker.gitDelta).toBe("clean");
		const input = await classificationInput(
			{ ...state, handle: { ...state.handle, base: null } },
			root,
			sessionId,
			false,
		);
		expect(classifyRecovery(input).classification).toBe("restart-clean");
	});
});

describe("harness control-plane phase 2 — CLI operate verb + JSON contract", () => {
	let cwd: string;
	const sessionId = "h-phase2-cli";

	beforeEach(async () => {
		cwd = join(tmpdir(), `pi-harness-phase2-cli-${Date.now()}-${Math.random().toString(36).slice(2)}`);
		await mkdir(cwd, { recursive: true });
		await setupRepo(cwd, sessionId);
	});

	afterEach(async () => {
		await rm(cwd, { recursive: true, force: true });
	});

	it("AC6: classify emits consistent JSON with operate in nextAllowedActions", async () => {
		const result = await runWorkflowCommand(
			["classify", "--input", JSON.stringify({ workspace: cwd, sessionId }), "--json"],
			cwd,
		);
		expect(result.status).toBe(0);
		const parsed = JSON.parse(result.stdout) as {
			ok: boolean;
			state: { lifecycle: string };
			evidence: { decision: { classification: string } };
			nextAllowedActions: { verb: string; available: boolean }[];
		};
		expect(parsed.ok).toBe(true);
		expect(parsed.state.lifecycle).toBe("started");
		expect(parsed.evidence.decision.classification).toBe("restart-clean");
		expect(parsed.nextAllowedActions.some((a) => a.verb === "operate" && a.available)).toBe(true);
	});

	it("AC6: operate offline best-effort blocks (no live owner, no-op rpc) without finalizing", async () => {
		const result = await runWorkflowCommand(
			["operate", "--input", JSON.stringify({ workspace: cwd, sessionId, goal: "x", maxIterations: 1 }), "--json"],
			cwd,
		);
		expect(result.status).toBe(1);
		const parsed = JSON.parse(result.stdout) as { completed: boolean; lifecycle: string; blockers: string[] };
		expect(parsed.completed).toBe(false);
		expect(parsed.lifecycle).toBe("blocked");
		// offline operate never finalizes; the specific blocker is environment-dependent
		// (spawned owner may or may not come live in the test harness), so only assert
		// the safe never-completes contract.
		expect(parsed.blockers.length).toBeGreaterThan(0);
	});

	it("AC6: operate requires a goal", async () => {
		const result = await runWorkflowCommand(
			["operate", "--input", JSON.stringify({ workspace: cwd, sessionId }), "--json"],
			cwd,
		);
		expect(result.status).toBe(1);
	});
});

describe("harness control-plane phase 2 — consumeBudget keying", () => {
	it("restart-clean on clean consumes nothing; on zero-delta consumes zeroDeltaVanish", () => {
		const state = makeState("/tmp", "h-budget", null);
		const clean = consumeBudget(
			state,
			{
				classification: "restart-clean",
				reason: "owner-vanished-clean",
				severity: "warn",
				ownerRequired: true,
				blocked: false,
				blockers: [],
			},
			"clean",
		);
		expect(clean.retries.zeroDeltaVanish).toBeUndefined();
		const zero = consumeBudget(
			state,
			{
				classification: "restart-clean",
				reason: "owner-vanished-zero-delta",
				severity: "warn",
				ownerRequired: true,
				blocked: false,
				blockers: [],
			},
			"zero-delta",
		);
		expect(zero.retries.zeroDeltaVanish).toBe(1);
	});

	it("continue consumes validationRepair only on validation-failed reason; healthy continue consumes nothing", () => {
		const state = makeState("/tmp", "h-budget", null);
		const repair = consumeBudget(
			state,
			{
				classification: "continue",
				reason: "validation-failed-repair-budget-remains",
				severity: "warn",
				ownerRequired: true,
				blocked: false,
				blockers: [],
			},
			"clean",
		);
		expect(repair.retries.validationRepair).toBe(1);
		const healthy = consumeBudget(
			state,
			{
				classification: "continue",
				reason: "healthy",
				severity: "info",
				ownerRequired: true,
				blocked: false,
				blockers: [],
			},
			"clean",
		);
		expect(healthy.retries.validationRepair).toBeUndefined();
	});
});
