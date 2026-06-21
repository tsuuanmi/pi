/**
 * Harness GC adapter (Phase 3, Pi-first).
 *
 * Reaps only confirmed-dead owner sessions: a session is removable iff its lease classifies as
 * `"dead"` (TTL-irrelevant, liveness-only) AND a fail-closed pid probe confirms ESRCH. Expired-but-
 * alive, EPERM, malformed, missing, and ambiguous/no-pid leases are KEPT (expired-but-alive is
 * flagged, never removed). Dry-run by default; `--prune` performs full session-dir removal via
 * {@link reapDeadOwnerSessions} / `removeSession`.
 *
 * This module owns the GC *orchestration*: enumerating session trees, classifying records,
 * building the {@link GcReport}, and the single fail-closed probe contract ({@link gcPidProbe}).
 * Per-session reprobe+remove lives in {@link reapDeadOwnerSessions} (lease.ts). The
 * {@link GcStoreAdapter} seam lets future stores (team workers, file locks, tmux sessions, registry
 * entries) plug in without changing this orchestrator.
 *
 * KNOWN CONCURRENCY LIMITATIONS (both accepted for Phase 3; a shared lease-dir lock fix is
 * deferred to a future concurrency phase):
 *  1. Re-acquire TOCTOU: between collect and prune, a new owner may `acquireLease` (it sees the old
 *     lease classify as `dead`, takes over, writes a fresh live lease). `prune` re-reads +
 *     re-probes immediately before `removeSession` to narrow this window, but cannot close it.
 *  2. Concurrent-mutation window: `removeSession` does NOT acquire the session-dir `.mutation` lock
 *     nor the per-file `withFileMutationQueue` lock, so it races any in-flight
 *     `mutateRuntimeSession` (event/receipt/state writes). `prune`'s re-probe sees a fresh live lease
 *     and SKIPS, which avoids deleting a session actively being written; a true fix (a lock shared by
 *     `acquireLease`/`mutateRuntimeSession`/`reapDeadOwnerSessions`) is deferred.
 */
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import {
	classifyLeaseStatus,
	type LeaseStatus,
	type PidStatus,
	reapDeadOwnerSessions,
	type SessionLease,
} from "./lease.ts";
import { sessionPaths } from "./storage.ts";

/** Fail-closed probe status. `unknown` folds ambiguous/invalid pids (NaN/undefined/EINVAL, unknown
 * errors) into a KEEP outcome so they are never reaped. */
export type GcPidProbeStatus = "alive" | "dead" | "eperm" | "unknown";

/** Outcome of a fail-closed pid probe, including a self-documenting reason for diagnostics. */
export interface GcPidProbeOutcome {
	status: GcPidProbeStatus;
	reason: "alive" | "esrch" | "eperm" | "no-pid" | "unknown-error";
}

/** Fail-closed pid probe contract. One shared probe for collect + prune. */
export type GcPidProbe = (pid: number) => GcPidProbeOutcome;

/** Coarse, structural flag surfaced in the {@link GcReport} so "expired-but-alive flagged" and
 * "live owner never deleted" are checkable structurally rather than by string matching. */
export type GcSessionFlag = "expired-alive" | "eperm-alive" | "no-pid" | "malformed";

/** Per-session status. Extends {@link LeaseStatus} with `malformed` (unparseable lease JSON). */
export type GcSessionStatus = LeaseStatus | "malformed";

/** Per-session GC classification result (the report's session entry). */
export interface GcSessionRecord {
	sessionId: string;
	/** Root that owns this collected session. Matches Gajae's root-carrying GC records and prevents
	 * multi-root duplicate session IDs from pruning/skipping the wrong root. */
	root?: string;
	status: GcSessionStatus;
	removable: boolean;
	flagged?: GcSessionFlag;
	reason: string;
}

/** Aggregate counts for a {@link GcReport}. `expiredAlive` is a real bucket (expired-but-alive). */
export interface GcCounts {
	total: number;
	removable: number;
	kept: number;
	expiredAlive: number;
	errors: number;
}

/** An error record for a session that could not be classified (malformed/missing lease, read error). */
export interface GcErrorRecord {
	sessionId?: string;
	message: string;
}

/** Report for a single GC store (e.g. harness-leases). `roots` echoes the swept roots. */
export interface GcStoreReport {
	store: string;
	roots: string[];
	sessions: GcSessionRecord[];
}

/** The full GC report JSON shape (committed contract asserted by integration/e2e tests). */
export interface GcReport {
	dry_run: boolean;
	stores: GcStoreReport[];
	counts: GcCounts;
	errors: GcErrorRecord[];
}

/** Runtime context threaded through every adapter call. `roots` is `readonly string[]` so future
 * multi-root enumeration populates the array without changing the adapter signature. */
export interface GcContext {
	roots: readonly string[];
	probe: GcPidProbe;
	clock?: () => number;
	prune: boolean;
	dryRun: boolean;
}

/** Injectable store seam. Future stores (team workers, file locks, tmux sessions, registry entries)
 * implement this interface; the orchestrator ({@link collectGcReport}) does not change. */
export interface GcStoreAdapter {
	store: string;
	collect(ctx: GcContext): Promise<GcSessionRecord[]>;
	prune(record: GcSessionRecord, ctx: GcContext): Promise<GcSessionRecord>;
}

/** Fail-closed pid probe.
 *
 * ESRCH -> `dead` (truly reaped); alive -> `alive`; EPERM -> `eperm`; invalid pid (`<= 0` or
 * non-finite, incl. `NaN`/`undefined`) -> `no-pid`/`unknown`; any other throw -> `unknown-error`.
 * Never returns `dead` for an ambiguous/invalid pid. This is the single shared probe contract;
 * `classifyLeaseStatus` receives it wrapped via {@link gcProbeToLeasePidStatus} so the `unknown`
 * outcome lands on the KEEP (`alive`) branch. */
export function gcPidProbe(pid: number): GcPidProbeOutcome {
	if (!Number.isFinite(pid) || pid <= 0) return { status: "unknown", reason: "no-pid" };
	try {
		process.kill(pid, 0);
		return { status: "alive", reason: "alive" };
	} catch (error) {
		const code = (error as NodeJS.ErrnoException).code;
		if (code === "ESRCH") return { status: "dead", reason: "esrch" };
		if (code === "EPERM") return { status: "eperm", reason: "eperm" };
		return { status: "unknown", reason: "unknown-error" };
	}
}

/** Adapt a fail-closed {@link GcPidProbe} into the `PidStatus` contract accepted by
 * {@link classifyLeaseStatus} and {@link reapDeadOwnerSessions}. `unknown` is folded onto `alive`
 * (KEEP) so invalid/ambiguous pids are never classified as `dead` (reapable). EPERM stays `eperm`
 * (also KEPT). */
export function gcProbeToLeasePidStatus(probe: GcPidProbe): (pid: number) => PidStatus {
	return (pid: number): PidStatus => {
		const outcome = probe(pid);
		switch (outcome.status) {
			case "alive":
				return "alive";
			case "dead":
				return "dead";
			case "eperm":
				return "eperm";
			case "unknown":
				return "alive";
		}
	};
}

/** Read a lease, distinguishing missing (ENOENT) from malformed (parse/read error). */
async function readLeaseForGc(
	root: string,
	sessionId: string,
): Promise<{ lease: SessionLease | null; error: string | null }> {
	const path = sessionPaths(root, sessionId).lease;
	try {
		const raw = await readFile(path, "utf8");
		try {
			return { lease: JSON.parse(raw) as SessionLease, error: null };
		} catch {
			return { lease: null, error: "malformed-lease-json" };
		}
	} catch (error) {
		const code = (error as NodeJS.ErrnoException).code;
		if (code === "ENOENT") return { lease: null, error: null };
		return { lease: null, error: `read-lease-error:${code ?? "unknown"}` };
	}
}

/** Decode an encoded session directory name back to the real session id.
 *
 * `encodeSessionId` only transforms `.` -> `%2E` (encodeURIComponent leaves the rest of the
 * `[A-Za-z0-9._-]` charset untouched), so decoding is the reverse substitution. */
function decodeSessionDirName(name: string): string {
	return name.replaceAll("%2E", ".");
}

function withCollectedRoot(record: Omit<GcSessionRecord, "root"> | GcSessionRecord, root: string): GcSessionRecord {
	return Object.defineProperty(record, "root", { value: root, enumerable: false }) as GcSessionRecord;
}

/** Injectable adapter for the harness-leases store: enumerates `<root>/sessions/*`, classifies each
 * session via {@link classifyLeaseStatus} + {@link gcPidProbe}, and prunes via
 * {@link reapDeadOwnerSessions}. */
export const HarnessLeasesGcStoreAdapter: GcStoreAdapter = {
	store: "harness-leases",

	async collect(ctx: GcContext): Promise<GcSessionRecord[]> {
		const records: GcSessionRecord[] = [];
		for (const root of ctx.roots) {
			const sessionsDir = join(root, "sessions");
			let entries: string[];
			try {
				entries = await readdir(sessionsDir);
			} catch (error) {
				const code = (error as NodeJS.ErrnoException).code;
				if (code === "ENOENT") continue;
				throw error;
			}
			for (const entry of entries) {
				const sessionId = decodeSessionDirName(entry);
				const { lease, error } = await readLeaseForGc(root, sessionId);
				if (error) {
					const malformed = error === "malformed-lease-json";
					records.push(
						withCollectedRoot(
							{
								sessionId,
								status: malformed ? "malformed" : "missing",
								removable: false,
								flagged: malformed ? "malformed" : undefined,
								reason: error,
							},
							root,
						),
					);
					continue;
				}
				if (!lease) {
					records.push(
						withCollectedRoot(
							{
								sessionId,
								status: "missing",
								removable: false,
								reason: "no-lease",
							},
							root,
						),
					);
					continue;
				}
				const leasePidStatus = classifyLeaseStatus(lease, {
					clock: ctx.clock,
					probe: gcProbeToLeasePidStatus(ctx.probe),
				});
				const probeOutcome = ctx.probe(lease.pid);
				const removable = leasePidStatus === "dead" && probeOutcome.status === "dead";
				const flagged = flagForSession(leasePidStatus, probeOutcome.reason);
				records.push(
					withCollectedRoot(
						{
							sessionId,
							status: leasePidStatus,
							removable,
							flagged,
							reason: removable
								? "owner-dead"
								: probeOutcome.reason === "no-pid"
									? "no-pid-kept"
									: leasePidStatus === "missing"
										? "no-lease"
										: leasePidStatus,
						},
						root,
					),
				);
			}
		}
		return records;
	},

	async prune(record: GcSessionRecord, ctx: GcContext): Promise<GcSessionRecord> {
		if (!record.removable) return record;
		const roots = record.root ? [record.root] : ctx.roots;
		for (const root of roots) {
			const outcome = await reapDeadOwnerSessions(root, record.sessionId, {
				probe: gcProbeToLeasePidStatus(ctx.probe),
				clock: ctx.clock,
				prune: ctx.prune && !ctx.dryRun,
			});
			if (outcome.removed) return withCollectedRoot({ ...record, reason: "removed" }, root);
			if (outcome.status === "missing") continue;
			// Re-probe skipped the session (re-acquired / ambiguous) - leave it in place.
			return withCollectedRoot({ ...record, removable: false, reason: `re-probe-skipped:${outcome.status}` }, root);
		}
		return record.root
			? withCollectedRoot({ ...record, removable: false, reason: "re-probe-skipped:missing" }, record.root)
			: { ...record, removable: false, reason: "re-probe-skipped:missing" };
	},
};

function flagForSession(
	leasePidStatus: LeaseStatus,
	probeReason: GcPidProbeOutcome["reason"],
): GcSessionFlag | undefined {
	if (probeReason === "no-pid") return "no-pid";
	if (leasePidStatus === "expiredAlive") return "expired-alive";
	if (leasePidStatus === "epermAlive") return "eperm-alive";
	return undefined;
}

/** Build a {@link GcReport} by collecting from every adapter and (when `ctx.prune && !ctx.dryRun`)
 * pruning removable records. Counts are computed structurally from the records. */
export async function collectGcReport(adapters: readonly GcStoreAdapter[], ctx: GcContext): Promise<GcReport> {
	const stores: GcStoreReport[] = [];
	const errors: GcErrorRecord[] = [];
	let total = 0;
	let removable = 0;
	let expiredAlive = 0;
	for (const adapter of adapters) {
		let records: GcSessionRecord[];
		try {
			records = await adapter.collect(ctx);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			errors.push({ message: `${adapter.store}:collect:${message}` });
			records = [];
		}
		for (const record of records) {
			if (record.status === "malformed" || record.status === "missing") {
				errors.push({ sessionId: record.sessionId, message: record.reason });
			}
		}
		let prunedRecords = records;
		if (ctx.prune && !ctx.dryRun) {
			prunedRecords = [];
			for (const record of records) {
				if (record.removable) {
					try {
						const outcome = await adapter.prune(record, ctx);
						prunedRecords.push(outcome);
					} catch (error) {
						const message = error instanceof Error ? error.message : String(error);
						errors.push({ sessionId: record.sessionId, message: `${adapter.store}:prune:${message}` });
						prunedRecords.push({ ...record, removable: false, reason: `prune-error:${message}` });
					}
				} else {
					prunedRecords.push(record);
				}
			}
		}
		const storeRoots = ctx.roots.map((root) => root);
		stores.push({ store: adapter.store, roots: storeRoots, sessions: prunedRecords });
		total += prunedRecords.length;
		removable += prunedRecords.filter((record) => record.removable).length;
		expiredAlive += prunedRecords.filter(
			(record) => record.status === "expiredAlive" || record.flagged === "expired-alive",
		).length;
	}
	const kept = total - removable;
	return {
		dry_run: ctx.dryRun,
		stores,
		counts: { total, removable, kept, expiredAlive, errors: errors.length },
		errors,
	};
}

/** Exit code for a {@link GcReport}: 0 on success, 1 if any error record exists. Never returns 2
 * (matches the rest of the workflow CLI's 0/1 contract). */
export function computeGcExitCode(report: GcReport): number {
	return report.counts.errors > 0 || report.errors.length > 0 ? 1 : 0;
}
