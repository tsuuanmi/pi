export interface RunIdentity {
	runId: string;
	metadata?: Readonly<Record<string, unknown>>;
}

export function createRunIdentity(input?: RunIdentity): RunIdentity {
	return normalizeRunIdentity(input ?? { runId: globalThis.crypto.randomUUID() });
}

export function normalizeRunIdentity(value: unknown): RunIdentity {
	const record = asRecord(value, "Run identity");
	const runId = normalizeRunId(record.runId);
	const metadata = normalizeRunMetadata(record.metadata);
	return Object.freeze({
		runId,
		...(metadata !== undefined ? { metadata } : {}),
	});
}

export function assertSameRunIdentity(left: RunIdentity, right: RunIdentity): void {
	if (left.runId !== right.runId) {
		throw new Error(`Checkpoint run identity mismatch: ${left.runId} !== ${right.runId}.`);
	}
	if (JSON.stringify(left.metadata ?? {}) !== JSON.stringify(right.metadata ?? {})) {
		throw new Error(`Checkpoint run metadata mismatch for run identity: ${left.runId}.`);
	}
}

function normalizeRunId(value: unknown): string {
	if (typeof value !== "string" || value.trim().length === 0) {
		throw new Error("Run identity runId must be a non-empty string.");
	}
	return value;
}

function normalizeRunMetadata(value: unknown): Readonly<Record<string, unknown>> | undefined {
	if (value === undefined) return undefined;
	const record = asRecord(value, "Run identity metadata");
	return Object.freeze({ ...record });
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		throw new Error(`${label} must be an object.`);
	}
	return value as Record<string, unknown>;
}
