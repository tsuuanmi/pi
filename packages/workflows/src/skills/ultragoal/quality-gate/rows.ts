export const PASSED_STATUS = "passed";
export const COVERED_STATUS = "covered";
export const VERIFIED_STATUS = "verified";
export const NOT_APPLICABLE_STATUS = "not_applicable";
export const ACCEPTED_PROOF_STATUSES = new Set([COVERED_STATUS, PASSED_STATUS, VERIFIED_STATUS]);
export const CLEAN_ARCHITECT_STATUS = "CLEAR";
export const APPROVE_RECOMMENDATION = "APPROVE";

export type Row = Record<string, unknown>;

export function isPlainObject(value: unknown): value is Row {
	return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function nonEmptyString(value: unknown): string | null {
	return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

export function nonEmptyStringArray(value: unknown): string[] | null {
	if (!Array.isArray(value) || value.length === 0) return null;
	const strings: string[] = [];
	for (const item of value) {
		const trimmed = nonEmptyString(item);
		if (!trimmed) return null;
		strings.push(trimmed);
	}
	return strings;
}

export function requireObject(value: unknown, fieldName: string): Row {
	if (!isPlainObject(value)) throw new Error(`qualityGate ${fieldName} must be an object`);
	return value;
}

export function requireObjectArray(value: unknown, fieldName: string): Row[] {
	if (!Array.isArray(value) || value.length === 0) {
		throw new Error(`qualityGate ${fieldName} must be a non-empty object array`);
	}
	return value.map((item, index) => requireObject(item, `${fieldName}[${index}]`));
}

export function requiredStringField(row: Row, key: string, fieldName: string): string {
	const value = row[key];
	if (typeof value !== "string" || value.trim().length === 0) {
		const hint =
			key === "obligation" && typeof row.description === "string" && row.description.trim().length > 0
				? "; found description, but contractCoverage rows require obligation"
				: "";
		throw new Error(`qualityGate ${fieldName}.${key} must be a non-empty string${hint}`);
	}
	return value.trim();
}

export function optionalStatusField(row: Row, fieldName: string): string | null {
	if (row.status === undefined) return null;
	const status = requiredStringField(row, "status", fieldName).toLowerCase();
	if (status === "todo") throw new Error(`qualityGate ${fieldName}.status must not be todo`);
	return status;
}

export function requireStringLinks(value: unknown, fieldName: string): string[] {
	const strings = nonEmptyStringArray(value);
	if (!strings) throw new Error(`qualityGate ${fieldName} must be a non-empty string array`);
	return strings;
}

export function optionalStringLinks(row: Row, key: string, fieldName: string): string[] | null {
	if (row[key] === undefined) return null;
	return requireStringLinks(row[key], `${fieldName}.${key}`);
}

export function requireResolvedLinks(ids: string[], map: Map<string, Row>, fieldName: string): void {
	for (const id of ids) {
		if (!map.has(id)) throw new Error(`qualityGate ${fieldName} references unknown id ${id}`);
	}
}

export function requireProofStatus(status: string, fieldName: string): void {
	if (!ACCEPTED_PROOF_STATUSES.has(status) && status !== NOT_APPLICABLE_STATUS) {
		throw new Error(`qualityGate ${fieldName}.status must be covered, passed, verified, or not_applicable`);
	}
}

export function requireSuccessStatus(status: string, fieldName: string): void {
	requireProofStatus(status, fieldName);
	if (status === NOT_APPLICABLE_STATUS) {
		throw new Error(`qualityGate ${fieldName}.status must be covered, passed, or verified`);
	}
}

export function rowOutcomeStatuses(row: Row, fieldName: string): string[] {
	const statuses: string[] = [];
	const status = optionalStatusField(row, fieldName);
	if (status) statuses.push(status);
	const verdict = nonEmptyString(row.verdict);
	if (verdict) statuses.push(verdict.toLowerCase());
	const result = nonEmptyString(row.result);
	if (result) statuses.push(result.toLowerCase());
	if (statuses.length === 0) throw new Error(`qualityGate ${fieldName}.verdict must be a non-empty string`);
	return statuses;
}

export function requireSuccessfulRowOutcome(row: Row, fieldName: string): void {
	for (const status of rowOutcomeStatuses(row, fieldName)) requireSuccessStatus(status, fieldName);
}

export function buildRowIdMap(rows: Row[], fieldName: string): Map<string, Row> {
	const ids = new Map<string, Row>();
	for (const [index, row] of rows.entries()) {
		const id = requiredStringField(row, "id", `${fieldName}[${index}]`);
		if (ids.has(id)) throw new Error(`qualityGate ${fieldName} contains duplicate id ${id}`);
		ids.set(id, row);
	}
	return ids;
}

export function requireEmptyBlockers(value: unknown, fieldName: string): void {
	if (!Array.isArray(value)) throw new Error(`qualityGate ${fieldName} must be an empty array`);
	if (value.length !== 0) throw new Error(`qualityGate ${fieldName} must be empty`);
}

export function requireNonEmptyStringArray(value: unknown, fieldName: string): string[] {
	const result = nonEmptyStringArray(value);
	if (!result) throw new Error(`qualityGate ${fieldName} must be a non-empty string array`);
	return result;
}
