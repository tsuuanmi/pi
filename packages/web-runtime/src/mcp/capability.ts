import { randomBytes, timingSafeEqual } from "node:crypto";

export class CapabilityError extends Error {
	constructor(message: string, options?: ErrorOptions) {
		super(message, options);
		this.name = "CapabilityError";
	}
}

interface CapabilityRecord {
	turnId: string;
	expiresAt: number;
	revoked: boolean;
}

export class CapabilityStore {
	private readonly records = new Map<string, CapabilityRecord>();
	private readonly now: () => number;

	constructor(now: () => number = Date.now) {
		this.now = now;
	}

	issue(turnId: string, lifetimeMs: number): string {
		if (!Number.isSafeInteger(lifetimeMs) || lifetimeMs <= 0)
			throw new CapabilityError("invalid capability lifetime");
		const token = randomBytes(32).toString("base64url");
		this.records.set(token, { turnId, expiresAt: this.now() + lifetimeMs, revoked: false });
		return token;
	}

	revoke(token: string): void {
		const record = this.records.get(token);
		if (record) record.revoked = true;
	}

	revokeTurn(turnId: string): void {
		for (const record of this.records.values()) {
			if (record.turnId === turnId) record.revoked = true;
		}
	}

	assert(token: string, turnId: string): void {
		const record = this.find(token);
		if (!record) throw new CapabilityError("invalid capability");
		if (record.revoked || record.expiresAt <= this.now() || record.turnId !== turnId) {
			throw new CapabilityError("expired or revoked capability");
		}
	}

	private find(token: string): CapabilityRecord | undefined {
		for (const [candidate, record] of this.records) {
			const expected = Buffer.from(candidate);
			const actual = Buffer.from(token);
			if (expected.length === actual.length && timingSafeEqual(expected, actual)) return record;
		}
		return undefined;
	}
}
