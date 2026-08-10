import { randomBytes } from "node:crypto";

const SESSION_ID_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?$/;
const ENTRY_ID_PATTERN = /^[0-9a-f]{8}$/;
const MAX_ID_ATTEMPTS = 100;

export function assertSessionId(id: string): void {
	if (!SESSION_ID_PATTERN.test(id)) {
		throw new Error(
			"Session id must start and end with an alphanumeric character and contain only alphanumeric characters, dots, underscores, or hyphens.",
		);
	}
}

export function isEntryId(id: string): boolean {
	return ENTRY_ID_PATTERN.test(id);
}

export function createSessionId(now = new Date()): string {
	const timestamp = now.toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
	return `${timestamp}-${randomBytes(4).toString("hex")}`;
}

export function generateId(existingIds: { has(id: string): boolean }): string {
	for (let attempt = 0; attempt < MAX_ID_ATTEMPTS; attempt++) {
		const id = randomBytes(4).toString("hex");
		if (!existingIds.has(id)) return id;
	}
	throw new Error(`Unable to generate a unique entry id after ${MAX_ID_ATTEMPTS} attempts.`);
}
