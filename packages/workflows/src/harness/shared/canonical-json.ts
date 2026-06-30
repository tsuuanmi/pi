/**
 * Canonical JSON serialization for deterministic hashing.
 *
 * Strips `undefined` values, sorts object keys lexicographically, and
 * recurses into arrays/objects so the serialized form does not depend on
 * insertion order. This is the single canonicalizer used by workflow receipt
 * hashing (`hashStructuredValue`) and the workflow envelope checksum. No
 * second stable-serializer should be introduced.
 *
 * Promoted out of `state-writer.ts` so receipt/quality-gate modules can share
 * it without importing the writer. `state-writer.ts` re-exports this for
 * existing callers.
 */
export function canonicalizeJson(value: unknown): unknown {
	if (Array.isArray(value)) return value.map((item) => canonicalizeJson(item));
	if (typeof value !== "object" || value === null) return value;
	const record = value as Record<string, unknown>;
	const out: Record<string, unknown> = {};
	for (const key of Object.keys(record).sort()) {
		const item = record[key];
		if (item !== undefined) out[key] = canonicalizeJson(item);
	}
	return out;
}
