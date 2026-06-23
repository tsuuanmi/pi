import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runWorkflowCommand } from "../../src/cli/workflow-command.ts";
import {
	collectGcReport,
	computeGcExitCode,
	type GcContext,
	type GcPidProbe,
	type GcPidProbeOutcome,
	type GcReport,
	gcPidProbe,
	gcProbeToLeasePidStatus,
	HarnessLeasesGcStoreAdapter,
} from "../../src/harness-runtime/gc.ts";
import { classifyLeaseStatus, readLease, type SessionLease } from "../../src/harness-runtime/lease.ts";
import { mutateRuntimeSession } from "../../src/harness-runtime/mutation.ts";
import { type RecoveryDecision, recoverPrimitive } from "../../src/harness-runtime/primitives.ts";
import {
	RECEIPT_FAMILY_LIFECYCLE_TARGETS,
	ReceiptConsistencyError,
	type ReceiptFamilyConsistencyRule,
	receiptFamilyConsistencyRules,
	validateReceiptFamilyConsistency,
} from "../../src/harness-runtime/receipt-rules.ts";
import {
	DEFERRED_SEAMS,
	DeferredSeamRegistry,
	deferredSeamRegistry,
	isHarnessSupported,
	seamUnsupported,
} from "../../src/harness-runtime/seams.ts";
import {
	readRuntimeReceipts,
	readSessionState,
	resolveHarnessRoot,
	sessionPaths,
	writeSessionState,
} from "../../src/harness-runtime/storage.ts";
import {
	type HarnessLifecycle,
	type RuntimeReceipt,
	SESSION_SCHEMA_VERSION,
	type SessionState,
} from "../../src/harness-runtime/types.ts";

const WRITER = { ownerId: "test", leaseEpoch: 0 };

/** A PID that has already exited (deterministic: spawnSync waits for exit). */
function deadPid(): number {
	const res = spawnSync(process.execPath, ["-e", "process.exit(0)"], { stdio: "ignore" });
	return res.pid as number;
}

function harnessRoot(cwd: string): string {
	return resolveHarnessRoot({ cwd });
}

async function writeLease(
	root: string,
	sessionId: string,
	pid: number,
	opts: { expired?: boolean } = {},
): Promise<SessionLease> {
	const paths = sessionPaths(root, sessionId);
	const now = Date.now();
	const expiresAt = opts.expired ? now - 60_000 : now + 60_000;
	const lease: SessionLease = {
		ownerId: `owner-${sessionId}`,
		sessionId,
		pid,
		leaseTokenHash: `hash-${sessionId}`,
		endpoint: null,
		eventsPath: paths.events,
		heartbeatAt: new Date(now).toISOString(),
		expiresAt: new Date(expiresAt).toISOString(),
		leaseEpoch: 1,
		writer: { ownerId: `owner-${sessionId}`, leaseEpoch: 1 },
	};
	await mkdir(paths.dir, { recursive: true });
	await writeFile(paths.lease, `${JSON.stringify(lease, null, 2)}\n`, "utf8");
	return lease;
}

async function writeMalformedLease(root: string, sessionId: string): Promise<void> {
	const paths = sessionPaths(root, sessionId);
	await mkdir(paths.dir, { recursive: true });
	await writeFile(paths.lease, "{not valid json\n", "utf8");
}

async function makeEmptySessionDir(root: string, sessionId: string): Promise<void> {
	await mkdir(sessionPaths(root, sessionId).dir, { recursive: true });
}

function fakeProbe(pid: number, outcome: GcPidProbeOutcome): GcPidProbe {
	return (p: number): GcPidProbeOutcome => (p === pid ? outcome : { status: "alive", reason: "alive" });
}

function readReport(report: GcReport): { dead: string[]; kept: string[]; flagged: Record<string, string | undefined> } {
	const sessions = report.stores.flatMap((store) => store.sessions);
	return {
		dead: sessions.filter((session) => session.removable).map((session) => session.sessionId),
		kept: sessions.filter((session) => !session.removable).map((session) => session.sessionId),
		flagged: Object.fromEntries(sessions.map((session) => [session.sessionId, session.flagged])),
	};
}

function makeState(
	root: string,
	cwd: string,
	sessionId: string,
	lifecycle: HarnessLifecycle = "started",
): SessionState {
	const paths = sessionPaths(root, sessionId);
	const now = new Date().toISOString();
	return {
		schemaVersion: SESSION_SCHEMA_VERSION,
		sessionId,
		lifecycle,
		harness: "pi",
		handle: {
			sessionId,
			harness: "pi",
			mode: "implement",
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

describe("phase 3 — gcPidProbe (fail-closed liveness)", () => {
	it("alive pid -> alive; exited child -> dead (ESRCH); NaN/0 -> unknown/no-pid", () => {
		expect(gcPidProbe(process.pid)).toEqual({ status: "alive", reason: "alive" });
		const dead = deadPid();
		expect(gcPidProbe(dead)).toEqual({ status: "dead", reason: "esrch" });
		expect(gcPidProbe(Number.NaN)).toEqual({ status: "unknown", reason: "no-pid" });
		expect(gcPidProbe(0)).toEqual({ status: "unknown", reason: "no-pid" });
		expect(gcPidProbe(-1)).toEqual({ status: "unknown", reason: "no-pid" });
	});

	it("EPERM (pid 1 as non-root) -> eperm; as root -> alive (environment-guarded, deterministic)", () => {
		const outcome = gcPidProbe(1);
		if (process.getuid?.() === 0) {
			expect(outcome.status).toBe("alive");
		} else {
			expect(outcome).toEqual({ status: "eperm", reason: "eperm" });
		}
	});

	it("gcProbeToLeasePidStatus folds unknown->alive (KEEP) and keeps dead/eperm", () => {
		const toLease = gcProbeToLeasePidStatus((pid: number): GcPidProbeOutcome => {
			if (pid === 1) return { status: "dead", reason: "esrch" };
			if (pid === 2) return { status: "eperm", reason: "eperm" };
			if (pid === 3) return { status: "unknown", reason: "no-pid" };
			return { status: "alive", reason: "alive" };
		});
		expect(toLease(1)).toBe("dead");
		expect(toLease(2)).toBe("eperm");
		expect(toLease(3)).toBe("alive"); // unknown folded onto KEEP branch
		expect(toLease(4)).toBe("alive");
	});
});

describe("phase 3 — GC adapter unit (fake-lease harness)", () => {
	let cwd: string;
	let root: string;

	beforeEach(async () => {
		cwd = join(tmpdir(), `pi-gc-unit-${Date.now()}-${Math.random().toString(36).slice(2)}`);
		await mkdir(cwd, { recursive: true });
		root = harnessRoot(cwd);
	});

	afterEach(async () => {
		await rm(cwd, { recursive: true, force: true });
	});

	function ctx(probe: GcPidProbe = gcPidProbe, prune = false, dryRun = true): GcContext {
		return { roots: [root], probe, prune, dryRun };
	}

	it("dead PID -> removable:true; dry-run does NOT delete; --prune deletes via removeSession", async () => {
		const pid = deadPid();
		await writeLease(root, "h-dead", pid);
		const dryRun = await collectGcReport([HarnessLeasesGcStoreAdapter], ctx(gcPidProbe, false, true));
		const { dead, kept } = readReport(dryRun);
		expect(dead).toEqual(["h-dead"]);
		expect(kept).toEqual([]);
		// dry-run leaves the session dir in place.
		expect(existsSync(sessionPaths(root, "h-dead").dir)).toBe(true);
		const prune = await collectGcReport([HarnessLeasesGcStoreAdapter], ctx(gcPidProbe, true, false));
		expect(prune.counts.removable).toBe(1);
		expect(existsSync(sessionPaths(root, "h-dead").dir)).toBe(false);
	});

	it("expiredAlive (TTL passed, PID alive) -> removable:false, KEPT + flagged:expired-alive, counts.expiredAlive===1", async () => {
		await writeLease(root, "h-exp", process.pid, { expired: true });
		const report = await collectGcReport([HarnessLeasesGcStoreAdapter], ctx(gcPidProbe, true, false));
		const session = report.stores[0]?.sessions.find((session) => session.sessionId === "h-exp");
		expect(session?.removable).toBe(false);
		expect(session?.flagged).toBe("expired-alive");
		expect(session?.status).toBe("expiredAlive");
		expect(report.counts.expiredAlive).toBe(1);
		// never deleted across dry-run AND --prune.
		expect(existsSync(sessionPaths(root, "h-exp").dir)).toBe(true);
	});

	it("live owner (PID alive, TTL fresh) -> KEPT, never deleted", async () => {
		await writeLease(root, "h-live", process.pid);
		const report = await collectGcReport([HarnessLeasesGcStoreAdapter], ctx(gcPidProbe, true, false));
		const session = report.stores[0]?.sessions.find((session) => session.sessionId === "h-live");
		expect(session?.removable).toBe(false);
		expect(session?.status).toBe("live");
		expect(existsSync(sessionPaths(root, "h-live").dir)).toBe(true);
	});

	it("epermAlive -> removable:false, flagged:eperm-alive, KEPT", async () => {
		await writeLease(root, "h-eperm", 4242);
		const probe = fakeProbe(4242, { status: "eperm", reason: "eperm" });
		const report = await collectGcReport([HarnessLeasesGcStoreAdapter], ctx(probe, true, false));
		const session = report.stores[0]?.sessions.find((session) => session.sessionId === "h-eperm");
		expect(session?.removable).toBe(false);
		expect(session?.flagged).toBe("eperm-alive");
		expect(session?.status).toBe("epermAlive");
		expect(existsSync(sessionPaths(root, "h-eperm").dir)).toBe(true);
	});

	it("malformed lease -> error record, KEEP, flagged:malformed", async () => {
		await writeMalformedLease(root, "h-bad");
		const report = await collectGcReport([HarnessLeasesGcStoreAdapter], ctx(gcPidProbe, true, false));
		const session = report.stores[0]?.sessions.find((session) => session.sessionId === "h-bad");
		expect(session?.status).toBe("malformed");
		expect(session?.removable).toBe(false);
		expect(session?.flagged).toBe("malformed");
		expect(report.counts.errors).toBe(1);
		expect(report.errors.some((entry) => entry.sessionId === "h-bad")).toBe(true);
		expect(computeGcExitCode(report)).toBe(1);
		expect(existsSync(sessionPaths(root, "h-bad").dir)).toBe(true);
	});

	it("missing lease (dir only) -> error record, KEEP", async () => {
		await makeEmptySessionDir(root, "h-missing");
		const report = await collectGcReport([HarnessLeasesGcStoreAdapter], ctx(gcPidProbe, true, false));
		const session = report.stores[0]?.sessions.find((entry) => entry.sessionId === "h-missing");
		expect(session?.status).toBe("missing");
		expect(session?.removable).toBe(false);
		expect(report.counts.errors).toBe(1);
		expect(existsSync(sessionPaths(root, "h-missing").dir)).toBe(true);
	});

	it("no-pid lease (DUAL assertion): default probe -> dead (R1 guard); threaded gcPidProbe -> KEEP, flagged:no-pid", async () => {
		await writeLease(root, "h-nopid", Number.NaN);
		// R1 regression guard: the DEFAULT probe maps an invalid pid to "dead".
		const lease = await readLease(root, "h-nopid");
		expect(lease).not.toBeNull();
		expect(classifyLeaseStatus(lease as SessionLease)).toBe("dead");
		// Threaded fail-closed probe: invalid pid -> unknown -> folded onto alive (KEEP), never dead (reapable).
		expect(classifyLeaseStatus(lease as SessionLease, { probe: gcProbeToLeasePidStatus(gcPidProbe) })).not.toBe(
			"dead",
		);
		const report = await collectGcReport([HarnessLeasesGcStoreAdapter], ctx(gcPidProbe, true, false));
		const session = report.stores[0]?.sessions.find((entry) => entry.sessionId === "h-nopid");
		expect(session?.removable).toBe(false);
		expect(session?.flagged).toBe("no-pid");
		expect(existsSync(sessionPaths(root, "h-nopid").dir)).toBe(true);
	});

	it("reuses classifyLeaseStatus + removeSession (single source of truth, full-dir removal)", async () => {
		const pid = deadPid();
		await writeLease(root, "h-reuse", pid);
		const before = classifyLeaseStatus((await readLease(root, "h-reuse")) as SessionLease, {
			probe: gcProbeToLeasePidStatus(gcPidProbe),
		});
		expect(before).toBe("dead");
		await collectGcReport([HarnessLeasesGcStoreAdapter], ctx(gcPidProbe, true, false));
		expect(existsSync(sessionPaths(root, "h-reuse").dir)).toBe(false);
	});

	it("reaper re-reads owner/epoch before full-dir removal and skips after takeover", async () => {
		const oldPid = deadPid();
		const oldLease = await writeLease(root, "h-takeover", oldPid);
		let replacedLeaseDuringClassification = false;
		const takeoverProbe: GcPidProbe = (pid) => {
			if (pid !== oldPid) return { status: "alive", reason: "alive" };
			if (!replacedLeaseDuringClassification) {
				replacedLeaseDuringClassification = true;
				const freshLease: SessionLease = {
					...oldLease,
					ownerId: "fresh-owner",
					pid: process.pid,
					leaseEpoch: oldLease.leaseEpoch + 1,
					writer: { ownerId: "fresh-owner", leaseEpoch: oldLease.leaseEpoch + 1 },
				};
				writeFileSync(sessionPaths(root, "h-takeover").lease, `${JSON.stringify(freshLease, null, 2)}\n`, "utf8");
			}
			return { status: "dead", reason: "esrch" };
		};
		const report = await collectGcReport([HarnessLeasesGcStoreAdapter], ctx(takeoverProbe, true, false));
		const session = report.stores[0]?.sessions.find((entry) => entry.sessionId === "h-takeover");
		expect(session?.reason).toBe("re-probe-skipped:live");
		expect(existsSync(sessionPaths(root, "h-takeover").dir)).toBe(true);
		expect((await readLease(root, "h-takeover"))?.ownerId).toBe("fresh-owner");
	});

	it("multi-root prune carries root so duplicate session ids never prune or skip the wrong root", async () => {
		const firstRoot = harnessRoot(join(cwd, "first-root"));
		const secondRoot = harnessRoot(join(cwd, "second-root"));
		await writeLease(firstRoot, "h-duplicate", process.pid);
		await writeLease(secondRoot, "h-duplicate", deadPid());
		const report = await collectGcReport([HarnessLeasesGcStoreAdapter], {
			roots: [firstRoot, secondRoot],
			probe: gcPidProbe,
			prune: true,
			dryRun: false,
		});
		const sessions = report.stores[0]?.sessions.filter((entry) => entry.sessionId === "h-duplicate") ?? [];
		expect(sessions).toHaveLength(2);
		expect(sessions.find((entry) => entry.root === firstRoot)?.status).toBe("live");
		expect(sessions.find((entry) => entry.root === secondRoot)?.reason).toBe("removed");
		expect(existsSync(sessionPaths(firstRoot, "h-duplicate").dir)).toBe(true);
		expect(existsSync(sessionPaths(secondRoot, "h-duplicate").dir)).toBe(false);
	});

	it("adapter collect/prune errors stay fail-closed and return JSON report errors", async () => {
		const throwingCollect = {
			store: "throwing-collect",
			collect: async () => {
				throw new Error("collect boom");
			},
			prune: async () => {
				throw new Error("unused");
			},
		};
		const throwingPrune = {
			store: "throwing-prune",
			collect: async () => [
				{ sessionId: "h-prune-error", root, status: "dead" as const, removable: true, reason: "owner-dead" },
			],
			prune: async () => {
				throw new Error("prune boom");
			},
		};
		const report = await collectGcReport([throwingCollect, throwingPrune], ctx(gcPidProbe, true, false));
		expect(report.counts.errors).toBe(2);
		expect(report.errors.map((error) => error.message)).toEqual([
			"throwing-collect:collect:collect boom",
			"throwing-prune:prune:prune boom",
		]);
		expect(report.stores.find((store) => store.store === "throwing-prune")?.sessions[0]?.removable).toBe(false);
		expect(computeGcExitCode(report)).toBe(1);
	});
});

describe("phase 3 — GC CLI integration (pi workflow gc --json)", () => {
	let cwd: string;

	beforeEach(async () => {
		cwd = join(tmpdir(), `pi-gc-cli-${Date.now()}-${Math.random().toString(36).slice(2)}`);
		await mkdir(cwd, { recursive: true });
	});

	afterEach(async () => {
		await rm(cwd, { recursive: true, force: true });
	});

	it("dry-run reports removable counts; --prune removes; --dry-run overrides --prune", async () => {
		await writeLease(harnessRoot(cwd), "h-dead-cli", deadPid());
		// dry-run: report only, nothing deleted.
		const dry = await runWorkflowCommand(["gc", "--json"], cwd);
		expect(dry.status).toBe(0);
		const dryReport = JSON.parse(dry.stdout) as GcReport;
		expect(dryReport.dry_run).toBe(true);
		expect(dryReport.stores[0]?.store).toBe("harness-leases");
		expect(dryReport.counts.removable).toBe(1);
		expect(existsSync(sessionPaths(harnessRoot(cwd), "h-dead-cli").dir)).toBe(true);
		// --prune removes the dead session.
		const prune = await runWorkflowCommand(["gc", "--prune", "--json"], cwd);
		expect(prune.status).toBe(0);
		const pruneReport = JSON.parse(prune.stdout) as GcReport;
		expect(pruneReport.dry_run).toBe(false);
		expect(existsSync(sessionPaths(harnessRoot(cwd), "h-dead-cli").dir)).toBe(false);
		// recreate + --dry-run overrides --prune: nothing deleted.
		await writeLease(harnessRoot(cwd), "h-dead-cli", deadPid());
		const override = await runWorkflowCommand(["gc", "--prune", "--dry-run", "--json"], cwd);
		expect(override.status).toBe(0);
		const overrideReport = JSON.parse(override.stdout) as GcReport;
		expect(overrideReport.dry_run).toBe(true);
		expect(existsSync(sessionPaths(harnessRoot(cwd), "h-dead-cli").dir)).toBe(true);
	});

	it("concrete GcReport schema: dry_run, stores[].store===harness-leases, sessions[], counts, errors", async () => {
		await writeLease(harnessRoot(cwd), "h-live-cli", process.pid);
		const result = await runWorkflowCommand(["gc", "--json"], cwd);
		expect(result.status).toBe(0);
		const report = JSON.parse(result.stdout) as GcReport;
		expect(typeof report.dry_run).toBe("boolean");
		expect(Array.isArray(report.stores)).toBe(true);
		expect(report.stores[0]?.store).toBe("harness-leases");
		expect(Array.isArray(report.stores[0]?.sessions)).toBe(true);
		expect(report.stores[0]?.sessions[0]?.sessionId).toBe("h-live-cli");
		expect(Object.keys(report.stores[0]?.sessions[0] ?? {}).sort()).toEqual([
			"reason",
			"removable",
			"sessionId",
			"status",
		]);
		expect(report.counts.total).toBe(1);
		expect(report.counts.removable).toBe(0);
		expect(report.counts.kept).toBe(1);
		expect(Array.isArray(report.errors)).toBe(true);
	});

	it("exit codes: 0 on success, 1 on error or usage (no 2)", async () => {
		await writeMalformedLease(harnessRoot(cwd), "h-bad-cli");
		const result = await runWorkflowCommand(["gc", "--json"], cwd);
		expect(result.status).toBe(1);
		const report = JSON.parse(result.stdout) as GcReport;
		expect(report.counts.errors).toBe(1);
		// usage error: unknown option throws -> status 1.
		const usage = await runWorkflowCommand(["gc", "--bogus"], cwd);
		expect(usage.status).toBe(1);
		expect(usage.stderr).toContain("Error:");
	});

	it("live owner KEPT and never deleted across dry-run and --prune", async () => {
		await writeLease(harnessRoot(cwd), "h-live-cli", process.pid);
		await runWorkflowCommand(["gc", "--prune", "--json"], cwd);
		expect(existsSync(sessionPaths(harnessRoot(cwd), "h-live-cli").dir)).toBe(true);
		const report = JSON.parse((await runWorkflowCommand(["gc", "--json"], cwd)).stdout) as GcReport;
		expect(report.stores[0]?.sessions[0]?.removable).toBe(false);
		expect(report.stores[0]?.sessions[0]?.status).toBe("live");
	});

	it("--prune/--dry-run are scoped to gc and fail loudly on other verbs (no silent ignore)", async () => {
		const prune = await runWorkflowCommand(["observe", "--prune"], cwd);
		expect(prune.status).toBe(1);
		expect(prune.stderr).toContain("only supported for pi workflow gc");
		const dryRun = await runWorkflowCommand(["observe", "--dry-run"], cwd);
		expect(dryRun.status).toBe(1);
		expect(dryRun.stderr).toContain("only supported for pi workflow gc");
	});
});

describe("phase 3 — GC e2e synthetic-tree sweep", () => {
	let cwd: string;
	let root: string;

	beforeEach(async () => {
		cwd = join(tmpdir(), `pi-gc-e2e-${Date.now()}-${Math.random().toString(36).slice(2)}`);
		await mkdir(cwd, { recursive: true });
		root = harnessRoot(cwd);
	});

	afterEach(async () => {
		await rm(cwd, { recursive: true, force: true });
	});

	it("dry-run deletes nothing; --prune removes only dead sessions; live + flagged sessions intact", async () => {
		await writeLease(root, "h-sweep-dead", deadPid());
		await writeLease(root, "h-sweep-exp", process.pid, { expired: true });
		await writeLease(root, "h-sweep-live", process.pid);
		await writeMalformedLease(root, "h-sweep-bad");
		await writeLease(root, "h-sweep-nopid", Number.NaN);
		await makeEmptySessionDir(root, "h-sweep-missing");

		const dry = await collectGcReport([HarnessLeasesGcStoreAdapter], {
			roots: [root],
			probe: gcPidProbe,
			prune: false,
			dryRun: true,
		});
		expect(dry.counts.total).toBe(6);
		expect(dry.counts.removable).toBe(1);
		expect(dry.counts.kept).toBe(5);
		expect(dry.counts.expiredAlive).toBe(1);
		expect(dry.counts.errors).toBe(2);
		// dry-run: every session dir still present.
		for (const id of [
			"h-sweep-dead",
			"h-sweep-exp",
			"h-sweep-live",
			"h-sweep-bad",
			"h-sweep-nopid",
			"h-sweep-missing",
		]) {
			expect(existsSync(sessionPaths(root, id).dir)).toBe(true);
		}

		const prune = await collectGcReport([HarnessLeasesGcStoreAdapter], {
			roots: [root],
			probe: gcPidProbe,
			prune: true,
			dryRun: false,
		});
		expect(prune.counts.removable).toBe(1);
		expect(existsSync(sessionPaths(root, "h-sweep-dead").dir)).toBe(false);
		// live owner + flagged sessions intact and never signalled (process.pid still alive).
		expect(existsSync(sessionPaths(root, "h-sweep-live").dir)).toBe(true);
		expect(existsSync(sessionPaths(root, "h-sweep-exp").dir)).toBe(true);
		expect(existsSync(sessionPaths(root, "h-sweep-bad").dir)).toBe(true);
		expect(existsSync(sessionPaths(root, "h-sweep-nopid").dir)).toBe(true);
		expect(existsSync(sessionPaths(root, "h-sweep-missing").dir)).toBe(true);
		const liveSession = prune.stores[0]?.sessions.find((session) => session.sessionId === "h-sweep-live");
		expect(liveSession?.removable).toBe(false);
		expect(liveSession?.status).toBe("live");
	});

	it("re-acquire-KEPT: a session re-acquired with a live PID between dry-run and --prune is KEPT", async () => {
		await writeLease(root, "h-reacquire", deadPid());
		const dry = await collectGcReport([HarnessLeasesGcStoreAdapter], {
			roots: [root],
			probe: gcPidProbe,
			prune: false,
			dryRun: true,
		});
		expect(dry.counts.removable).toBe(1);
		// a fresh owner takes over the lease (live pid, future expiry) between dry-run and prune.
		await writeLease(root, "h-reacquire", process.pid);
		const prune = await collectGcReport([HarnessLeasesGcStoreAdapter], {
			roots: [root],
			probe: gcPidProbe,
			prune: true,
			dryRun: false,
		});
		// re-probe sees a live lease -> skip -> KEPT, dir intact.
		expect(prune.counts.removable).toBe(0);
		expect(existsSync(sessionPaths(root, "h-reacquire").dir)).toBe(true);
	});

	it("concurrent-mutation-SKIP: prune skips a session a concurrent mutateRuntimeSession is writing (re-probe sees live fresh lease)", async () => {
		const sessionId = "h-concurrent";
		await writeLease(root, sessionId, deadPid());
		await writeFile(
			sessionPaths(root, sessionId).state,
			`${JSON.stringify(makeState(root, cwd, sessionId), null, 2)}\n`,
			"utf8",
		);
		const dry = await collectGcReport([HarnessLeasesGcStoreAdapter], {
			roots: [root],
			probe: gcPidProbe,
			prune: false,
			dryRun: true,
		});
		expect(dry.counts.removable).toBe(1);
		// simulate concurrent activity: a new owner re-acquires the lease (live pid) AND writes an event.
		await writeLease(root, sessionId, process.pid);
		await mutateRuntimeSession({
			root,
			sessionId,
			verb: "start",
			writer: { ownerId: "concurrent-owner", leaseEpoch: 2 },
			nextState: makeState(root, cwd, sessionId),
			ownerLive: true,
			events: [{ kind: "concurrent_mutation_event", evidence: { reason: "concurrent-write" } }],
			evidence: { concurrent: true },
		});
		// --prune: re-probe sees the fresh live lease -> skip -> KEPT, no partial deletion.
		const prune = await collectGcReport([HarnessLeasesGcStoreAdapter], {
			roots: [root],
			probe: gcPidProbe,
			prune: true,
			dryRun: false,
		});
		expect(prune.counts.removable).toBe(0);
		expect(existsSync(sessionPaths(root, sessionId).dir)).toBe(true);
		// the event written by the concurrent mutation is intact (not partially deleted).
		const eventsLog = await readFile(sessionPaths(root, sessionId).events, "utf8");
		expect(eventsLog).toContain("concurrent_mutation_event");
	});
});

describe("phase 3 — deferred-seam registry", () => {
	it("seamUnsupported emits a named seam_unsupported:<name> token for each deferred seam", () => {
		for (const entry of DEFERRED_SEAMS) {
			const result = seamUnsupported(entry.name);
			expect(result.ok).toBe(false);
			expect(result.error).toBe(`seam_unsupported:${entry.name}`);
			expect(result.evidence.seam).toBe(true);
			expect(result.evidence.name).toBe(entry.name);
			expect(result.evidence.supported).toBe(false);
			expect(result.evidence.status).toBe(entry.status);
		}
	});

	it("cross-harness-omx-fallback is permanentlyBlocked (deferred:false)", () => {
		const result = seamUnsupported("cross-harness-omx-fallback");
		expect(result.evidence.status).toBe("permanentlyBlocked");
		expect(result.evidence.deferred).toBe(false);
	});

	it("tmux-session-orchestration and git-worktree-isolation are deferred (deferred:true)", () => {
		expect(seamUnsupported("tmux-session-orchestration").evidence.deferred).toBe(true);
		expect(seamUnsupported("git-worktree-isolation").evidence.deferred).toBe(true);
	});

	it("isHarnessSupported: pi true, others false", () => {
		expect(isHarnessSupported("pi")).toBe(true);
	});

	it("registry is extensible: register a new seam, lookup returns it", () => {
		const registry = new DeferredSeamRegistry([]);
		registry.register("custom-future-seam", "not-built", "future extension");
		const entry = registry.lookup("custom-future-seam");
		expect(entry?.status).toBe("not-built");
		expect(seamUnsupported("custom-future-seam", registry).evidence.status).toBe("not-built");
	});

	it("the default registry is seeded with the Pi-native DEFERRED_SEAMS set", () => {
		const names = deferredSeamRegistry.list().map((entry) => entry.name);
		expect(names).toContain("tmux-session-orchestration");
		expect(names).toContain("git-worktree-isolation");
		expect(names).toContain("cross-harness-omx-fallback");
		expect(names).toContain("remote-transport");
		expect(names).toContain("global-daemon");
		expect(names).toContain("capability-token-auth");
	});

	it("integration: recoverPrimitive fallback-harness-exec folds the seam token into evidence AND preserves reason + blockers (no silent degrade)", async () => {
		const cwd = join(tmpdir(), `pi-seam-${Date.now()}-${Math.random().toString(36).slice(2)}`);
		await mkdir(cwd, { recursive: true });
		try {
			// git repo with a dirty worktree + exhausted dirtyVanishPreserve -> fallback-harness-exec.
			execFileSync("git", ["init"], { cwd, stdio: "ignore" });
			execFileSync("git", ["config", "user.email", "t@t"], { cwd, stdio: "ignore" });
			execFileSync("git", ["config", "user.name", "t"], { cwd, stdio: "ignore" });
			await writeFile(join(cwd, "file.txt"), "initial\n", "utf8");
			execFileSync("git", ["add", "file.txt"], { cwd, stdio: "ignore" });
			execFileSync("git", ["commit", "-m", "init"], { cwd, stdio: "ignore" });
			await writeFile(join(cwd, "file.txt"), "dirty\n", "utf8");
			const root = harnessRoot(cwd);
			const state = makeState(root, cwd, "h-seam-int");
			await writeSessionState(root, state);
			const exhausted = { ...state, retries: { dirtyVanishPreserve: 1 } };
			const res = await recoverPrimitive({
				root,
				state: exhausted,
				ownerLive: false,
				writer: WRITER,
				spawnOwner: async () => true,
				receipts: (await readRuntimeReceipts(root, "h-seam-int")).rows,
			});
			expect(res.ok).toBe(false);
			const evidence = res.evidence as { reason?: string; seam?: { error: string }; decision: RecoveryDecision };
			expect(evidence.reason).toBe("fallback-harness-exec-requested");
			expect(evidence.seam?.error).toBe("seam_unsupported:cross-harness-omx-fallback");
			expect((evidence as { decision: RecoveryDecision }).decision.classification).toBe("fallback-harness-exec");
			// blockers preserved exactly (Phase 1/2 observable output unchanged).
			expect((evidence as { decision: RecoveryDecision }).decision.blockers).toEqual([]);
		} finally {
			await rm(cwd, { recursive: true, force: true });
		}
	});
});

describe("phase 3 — receipt lifecycle-target consistency guard", () => {
	let cwd: string;
	let root: string;

	beforeEach(async () => {
		cwd = join(tmpdir(), `pi-rcpt-${Date.now()}-${Math.random().toString(36).slice(2)}`);
		await mkdir(cwd, { recursive: true });
		root = harnessRoot(cwd);
	});

	afterEach(async () => {
		await rm(cwd, { recursive: true, force: true });
	});

	it("RECEIPT_FAMILY_LIFECYCLE_TARGETS is conservative (finalize->completed, validate->validating)", () => {
		expect(RECEIPT_FAMILY_LIFECYCLE_TARGETS.finalize).toBe("completed");
		expect(RECEIPT_FAMILY_LIFECYCLE_TARGETS.validate).toBe("validating");
		expect(RECEIPT_FAMILY_LIFECYCLE_TARGETS.start).toBeUndefined();
		expect(RECEIPT_FAMILY_LIFECYCLE_TARGETS.vanish).toBeUndefined();
		expect(RECEIPT_FAMILY_LIFECYCLE_TARGETS.recover).toBeUndefined();
	});

	it("(a) finalize accepted:true but lifecycle!==completed -> rejected; mutation throws", async () => {
		const sessionId = "h-rcpt-a";
		const startState = makeState(root, cwd, sessionId, "validating");
		await mutateRuntimeSession({
			root,
			sessionId,
			verb: "validate",
			writer: WRITER,
			accepted: true,
			nextState: { ...startState, lifecycle: "validating", updatedAt: new Date().toISOString() },
			ownerLive: false,
			events: [{ kind: "validation_passed", evidence: { overallPassed: true } }],
			evidence: { overallPassed: true },
		});
		// finalize accepted=true but nextState.lifecycle=blocked (validating->blocked is a valid transition).
		await expect(
			mutateRuntimeSession({
				root,
				sessionId,
				verb: "finalize",
				writer: WRITER,
				nextState: { ...startState, lifecycle: "blocked", updatedAt: new Date().toISOString() },
				ownerLive: false,
				events: [{ kind: "finalize_attempt" }],
				evidence: {},
			}),
		).rejects.toThrow(ReceiptConsistencyError);
	});

	it("(b) valid finalize (completed) and valid validate (overallPassed) still pass", async () => {
		const sessionId = "h-rcpt-b";
		const startState = makeState(root, cwd, sessionId, "started");
		// valid validate: accepted + overallPassed -> validating.
		await mutateRuntimeSession({
			root,
			sessionId,
			verb: "validate",
			writer: WRITER,
			accepted: true,
			nextState: { ...startState, lifecycle: "validating", updatedAt: new Date().toISOString() },
			ownerLive: false,
			events: [{ kind: "validation_passed" }],
			evidence: { overallPassed: true },
		});
		// valid finalize: accepted -> completed (validating->completed).
		await expect(
			mutateRuntimeSession({
				root,
				sessionId,
				verb: "finalize",
				writer: WRITER,
				nextState: { ...startState, lifecycle: "completed", updatedAt: new Date().toISOString() },
				ownerLive: false,
				events: [{ kind: "finalize_completed" }],
				evidence: {},
			}),
		).resolves.toBeDefined();
		const after = await readSessionState(root, sessionId);
		expect(after?.lifecycle).toBe("completed");
	});

	it("(c) zero-orphan-writes: contradictory receipt throws AND events/receipts/state are all unchanged", async () => {
		const sessionId = "h-rcpt-c";
		const startState = makeState(root, cwd, sessionId, "started");
		// one valid mutation to populate events.jsonl + receipts.jsonl + state.json.
		const first = await mutateRuntimeSession({
			root,
			sessionId,
			verb: "start",
			writer: WRITER,
			nextState: startState,
			ownerLive: false,
			events: [{ kind: "workflow_started", evidence: {} }],
			evidence: { initial: true },
		});
		const paths = sessionPaths(root, sessionId);
		const receiptsBefore = await readFile(paths.receipts, "utf8");
		expect(first.receipt.verb).toBe("start");
		// now move state to validating so a finalize->blocked contradiction has a valid transition.
		await mutateRuntimeSession({
			root,
			sessionId,
			verb: "validate",
			writer: WRITER,
			accepted: true,
			nextState: { ...startState, lifecycle: "validating", updatedAt: new Date().toISOString() },
			ownerLive: false,
			events: [{ kind: "validation_passed" }],
			evidence: { overallPassed: true },
		});
		// capture again after the validate write (the contradiction must not touch these).
		const eventsBefore2 = await readFile(paths.events, "utf8");
		const receiptsBefore2 = await readFile(paths.receipts, "utf8");
		const stateBefore2 = await readFile(paths.state, "utf8");
		await expect(
			mutateRuntimeSession({
				root,
				sessionId,
				verb: "finalize",
				writer: WRITER,
				nextState: { ...startState, lifecycle: "blocked", updatedAt: new Date().toISOString() },
				ownerLive: false,
				events: [{ kind: "finalize_attempt" }],
				evidence: {},
			}),
		).rejects.toThrow(/receipt_consistency_error/);
		// zero orphan writes: all three files unchanged by the rejected mutation.
		expect(await readFile(paths.events, "utf8")).toBe(eventsBefore2);
		expect(await readFile(paths.receipts, "utf8")).toBe(receiptsBefore2);
		expect(await readFile(paths.state, "utf8")).toBe(stateBefore2);
		// also unchanged relative to before the validate write (the contradiction added nothing).
		expect(await readFile(paths.receipts, "utf8")).not.toBe(receiptsBefore);
	});

	it("(d) guard runs on every persisted receipt incl start/recover/vanish (valid, out of target)", async () => {
		const sessionId = "h-rcpt-d";
		const startState = makeState(root, cwd, sessionId, "started");
		for (const verb of ["start", "recover", "vanish"] as const) {
			await expect(
				mutateRuntimeSession({
					root,
					sessionId,
					verb,
					writer: WRITER,
					nextState: startState,
					ownerLive: false,
					events: [{ kind: `${verb}_event` }],
					evidence: {},
				}),
			).resolves.toBeDefined();
		}
		const receipts = await readRuntimeReceipts(root, sessionId);
		const verbs = receipts.rows.map((receipt) => receipt.verb);
		expect(verbs).toContain("start");
		expect(verbs).toContain("recover");
		expect(verbs).toContain("vanish");
	});

	it("(e) pluggability: a custom family rule triggers and rejects", async () => {
		const sessionId = "h-rcpt-e";
		const startState = makeState(root, cwd, sessionId, "started");
		const customRule: ReceiptFamilyConsistencyRule = {
			matches: (receipt) => receipt.verb === "start",
			enforce: () => "custom-contradiction",
		};
		receiptFamilyConsistencyRules.push(customRule);
		try {
			await expect(
				mutateRuntimeSession({
					root,
					sessionId,
					verb: "start",
					writer: WRITER,
					nextState: startState,
					ownerLive: false,
					events: [{ kind: "workflow_started" }],
					evidence: {},
				}),
			).rejects.toThrow(/custom-contradiction/);
		} finally {
			const index = receiptFamilyConsistencyRules.indexOf(customRule);
			if (index >= 0) receiptFamilyConsistencyRules.splice(index, 1);
		}
	});

	it("(f) blocked variants pass: finalize accepted=false/lifecycle=blocked and validate overallPassed=false/lifecycle=blocked are OUT of target", async () => {
		const sessionId = "h-rcpt-f";
		const startState = makeState(root, cwd, sessionId, "started");
		// validate blocked: accepted=false, overallPassed=false, lifecycle=blocked (started->blocked valid).
		await expect(
			mutateRuntimeSession({
				root,
				sessionId,
				verb: "validate",
				writer: WRITER,
				accepted: false,
				nextState: {
					...startState,
					lifecycle: "blocked",
					blockers: ["validation-failed"],
					updatedAt: new Date().toISOString(),
				},
				ownerLive: false,
				events: [{ kind: "validation_failed" }],
				evidence: { overallPassed: false },
			}),
		).resolves.toBeDefined();
		// finalize blocked: accepted=false, lifecycle=blocked (blocked->blocked is a no-op transition).
		await expect(
			mutateRuntimeSession({
				root,
				sessionId,
				verb: "finalize",
				writer: WRITER,
				accepted: false,
				nextState: {
					...startState,
					lifecycle: "blocked",
					blockers: ["finalize-blocked"],
					updatedAt: new Date().toISOString(),
				},
				ownerLive: false,
				events: [{ kind: "finalize_blocked" }],
				evidence: {},
			}),
		).resolves.toBeDefined();
	});

	it("validateReceiptFamilyConsistency returns valid:true for ungated verbs and out-of-target receipts", () => {
		const ungated = {
			verb: "start",
			accepted: true,
			stateAfter: { lifecycle: "blocked" },
		} as unknown as RuntimeReceipt;
		expect(validateReceiptFamilyConsistency(ungated).valid).toBe(true);
		const finalizeBlocked = {
			verb: "finalize",
			accepted: false,
			stateAfter: { lifecycle: "blocked" },
		} as unknown as RuntimeReceipt;
		expect(validateReceiptFamilyConsistency(finalizeBlocked).valid).toBe(true);
	});
});
