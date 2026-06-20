import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { sessionPaths } from "./storage.ts";

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
type PidStatus = "alive" | "dead" | "eperm";

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

export function classifyLeaseStatus(lease: SessionLease | null, clock?: () => number): LeaseStatus {
	if (!lease) return "missing";
	const status = pidStatus(lease.pid);
	if (status === "dead") return "dead";
	if (status === "eperm") return "epermAlive";
	return isExpired(lease, clock) ? "expiredAlive" : "live";
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
	if (existing && existing.ownerId !== opts.ownerId && classifyLeaseStatus(existing, opts.clock) !== "dead") {
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
