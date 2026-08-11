export function requiredTrimmedString(value: unknown, field: string): string {
	if (typeof value !== "string" || value.trim().length === 0 || value.trim() !== value) {
		throw new Error(`invalid ${field}: expected a non-empty, trimmed string`);
	}
	return value;
}
