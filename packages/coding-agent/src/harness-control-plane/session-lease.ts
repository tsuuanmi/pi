import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { removeSession, sessionPaths } from "./storage.ts";

export interface SessionLease {
	ownerId: string;
	sessionId: string;
	pid: number;
	leaseTokenHash: string;
	endpoint: { kind: "unix-socket"; path: string } | null;
	eventsPath: string;
	heartbeatAt: string;
	expiresAt: string;
	leaseEpoch: number;
	writer: { ownerId: string; leaseEpoch: number };
}

export type LeaseStatus = "missing" | "live" | "expiredAlive" | "dead" | "epermAlive";

/** Result of probing whether a process is still alive.
 *
 * This is the contract accepted by {@link classifyLeaseStatus} via `opts.probe` and by
 * {@link reapDeadOwnerSessions}. The DEFAULT probe ({@link pidStatus}) only ever returns
 * `alive` | `dead` | `eperm`; a fail-closed GC probe folds ambiguous/invalid pids into a KEEP
 * outcome (mapped to `alive`) so `classifyLeaseStatus` never marks them removable. */
export type PidStatus = "alive" | "dead" | "eperm";

export class LeaseError extends Error {
	readonly code: string;

	constructor(message: string, code: string) {
		super(message);
		this.name = "LeaseError";
		this.code = code;
	}
}

function nowMs(clock?: () => number): number {
	return clock ? clock() : Date.now();
}

function hashToken(token: string): string {
	return createHash("sha256").update(token).digest("hex");
}

/** Default process-liveness probe.
 *
 * WARNING: the DEFAULT probe is NOT fail-closed. An invalid pid (`NaN`/`undefined`, which throw
 * `ERR_INVALID_ARG_TYPE`) maps to `"dead"`, and `pid <= 0` is accepted by the kernel as a process
 * group reference (maps to `"alive"`). This mapping is LOAD-BEARING for Phase 1/2
 * {@link acquireLease} takeover of malformed/no-pid leases (it treats them as dead so a new
 * owner can take over) and MUST stay bit-identical. Fail-closed callers (GC reaping) MUST supply
 * their own probe via `classifyLeaseStatus`'s `opts.probe` / {@link reapDeadOwnerSessions}'s
 * `opts.probe` so invalid/ambiguous pids are KEPT, never reaped. */
function pidStatus(pid: number): PidStatus {
	try {
		process.kill(pid, 0);
		return "alive";
	} catch (error) {
		const code = (error as NodeJS.ErrnoException).code;
		if (code === "EPERM") return "eperm";
		return "dead";
	}
}

async function writeLeaseAtomic(file: string, lease: SessionLease): Promise<void> {
	await mkdir(dirname(file), { recursive: true });
	const tmp = `${file}.tmp-${randomBytes(4).toString("hex")}`;
	await writeFile(tmp, `${JSON.stringify(lease, null, 2)}\n`, "utf8");
	await rename(tmp, file);
}

export async function readLease(root: string, sessionId: string): Promise<SessionLease | null> {
	try {
		return JSON.parse(await readFile(sessionPaths(root, sessionId).lease, "utf8")) as SessionLease;
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
		throw error;
	}
}

export function isExpired(lease: SessionLease, clock?: () => number): boolean {
	return Date.parse(lease.expiresAt) <= nowMs(clock);
}

/** Classify a lease's liveness/expiry status.
 *
 * Pass `opts.probe` to override the default {@link pidStatus}. The default path (no `opts.probe`)
 * is bit-identical to the original single-`clock` signature and is load-bearing for Phase 1/2
 * {@link acquireLease} takeover (see {@link pidStatus}); it MUST stay non-fail-closed. GC callers
 * thread a fail-closed probe (mapped to this `PidStatus` contract) so ambiguous/invalid pids land
 * on the `alive` branch (KEPT) instead of `dead` (reapable). */
export function classifyLeaseStatus(
	lease: SessionLease | null,
	opts?: { clock?: () => number; probe?: (pid: number) => PidStatus },
): LeaseStatus {
	if (!lease) return "missing";
	const status = opts?.probe ? opts.probe(lease.pid) : pidStatus(lease.pid);
	if (status === "dead") return "dead";
	if (status === "eperm") return "epermAlive";
	return isExpired(lease, opts?.clock) ? "expiredAlive" : "live";
}

export async function acquireLease(
	root: string,
	sessionId: string,
	opts: {
		ownerId: string;
		pid: number;
		endpoint?: SessionLease["endpoint"];
		eventsPath: string;
		ttlMs: number;
		clock?: () => number;
	},
): Promise<{ lease: SessionLease; token: string }> {
	const existing = await readLease(root, sessionId);
	if (
		existing &&
		existing.ownerId !== opts.ownerId &&
		classifyLeaseStatus(existing, { clock: opts.clock }) !== "dead"
	) {
		throw new LeaseError(`lease_held:${sessionId}`, "lease_held");
	}
	const token = randomBytes(16).toString("hex");
	const now = nowMs(opts.clock);
	const epoch = existing && existing.ownerId === opts.ownerId ? existing.leaseEpoch : (existing?.leaseEpoch ?? 0) + 1;
	const lease: SessionLease = {
		ownerId: opts.ownerId,
		sessionId,
		pid: opts.pid,
		leaseTokenHash: hashToken(token),
		endpoint: opts.endpoint ?? null,
		eventsPath: opts.eventsPath,
		heartbeatAt: new Date(now).toISOString(),
		expiresAt: new Date(now + opts.ttlMs).toISOString(),
		leaseEpoch: epoch,
		writer: { ownerId: opts.ownerId, leaseEpoch: epoch },
	};
	await writeLeaseAtomic(sessionPaths(root, sessionId).lease, lease);
	return { lease, token };
}

export async function heartbeat(
	root: string,
	sessionId: string,
	ownerId: string,
	ttlMs: number,
	clock?: () => number,
): Promise<SessionLease> {
	const lease = await readLease(root, sessionId);
	if (!lease) throw new LeaseError(`no_lease:${sessionId}`, "no_lease");
	if (lease.ownerId !== ownerId) throw new LeaseError(`not_lease_holder:${sessionId}`, "not_lease_holder");
	const now = nowMs(clock);
	const next = { ...lease, heartbeatAt: new Date(now).toISOString(), expiresAt: new Date(now + ttlMs).toISOString() };
	await writeLeaseAtomic(sessionPaths(root, sessionId).lease, next);
	return next;
}

export function canWriteEvents(lease: SessionLease, ownerId: string, clock?: () => number): boolean {
	return lease.ownerId === ownerId && !isExpired(lease, clock);
}

export async function releaseLease(root: string, sessionId: string, ownerId: string): Promise<void> {
	const lease = await readLease(root, sessionId);
	if (!lease) return;
	if (lease.ownerId !== ownerId) throw new LeaseError(`not_lease_holder:${sessionId}`, "not_lease_holder");
	await rm(sessionPaths(root, sessionId).lease, { force: true });
}

/** Per-session reaper: remove a single dead owner's full session directory.
 *
 * This is the only destructive entry point in the lease layer. It re-reads the lease, re-classifies
 * with the supplied (fail-closed) `probe`, and — only when `prune` is set — re-probes immediately
 * before calling {@link removeSession} to narrow the re-acquire TOCTOU window. A lease that is not
 * confirmed `dead`, or any probe ambiguity, leaves the session in place (fail-closed). The caller
 * owns the probe; this function does NOT define its own (one fail-closed probe contract, in
 * `gc-adapter.ts`). NOTE: `removeSession` does not acquire the session-dir mutation lock, so this
 * can race a concurrent `mutateRuntimeSession`; a shared lease-dir lock fix is deferred. */
export async function reapDeadOwnerSessions(
	root: string,
	sessionId: string,
	opts: { probe: (pid: number) => PidStatus; clock?: () => number; prune: boolean },
): Promise<{ removed: boolean; status: LeaseStatus }> {
	const lease = await readLease(root, sessionId);
	if (!lease) return { removed: false, status: "missing" };
	const status = classifyLeaseStatus(lease, { clock: opts.clock, probe: opts.probe });
	if (status !== "dead") return { removed: false, status };
	if (!opts.prune) return { removed: false, status: "dead" };
	// Re-read + re-classify immediately before removal. This mirrors Gajae's owner/epoch guard at
	// the Pi Phase 3 seam boundary: if a fresh owner took over after collection/classification, keep
	// the session fail-closed. A shared lease-dir lock is still deferred, so this narrows but does not
	// eliminate the final race between this check and removeSession.
	const latest = await readLease(root, sessionId);
	if (!latest) return { removed: false, status: "missing" };
	if (latest.ownerId !== lease.ownerId || latest.leaseEpoch !== lease.leaseEpoch) {
		return { removed: false, status: classifyLeaseStatus(latest, { clock: opts.clock, probe: opts.probe }) };
	}
	const latestStatus = classifyLeaseStatus(latest, { clock: opts.clock, probe: opts.probe });
	if (latestStatus !== "dead") return { removed: false, status: latestStatus };
	await removeSession(root, sessionId);
	return { removed: true, status: "dead" };
}
