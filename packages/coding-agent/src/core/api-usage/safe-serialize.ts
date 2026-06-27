const DEFAULT_MAX_DEPTH = 12;
const DEFAULT_MAX_ARRAY = 200;
const DEFAULT_MAX_OBJECT_KEYS = 200;
const DEFAULT_MAX_STRING = 20000;

export interface SafeSerializeMetadata {
	truncatedPaths: string[];
}

export function safeSerialize(value: unknown, metadata: SafeSerializeMetadata, path = "$", depth = 0): unknown {
	if (value === null || typeof value === "number" || typeof value === "boolean") return value;
	if (typeof value === "string") return truncateString(value, metadata, path);
	if (typeof value === "bigint") return `[BigInt:${value.toString()}]`;
	if (typeof value === "undefined") return undefined;
	if (typeof value === "function") return "[Function]";
	if (typeof value === "symbol") return "[Symbol]";
	if (value instanceof Date) return value.toISOString();
	if (value instanceof RegExp) return value.toString();
	if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer) return "[Binary]";
	if (depth >= DEFAULT_MAX_DEPTH) {
		metadata.truncatedPaths.push(path);
		return "[Truncated:depth]";
	}
	return serializeObject(value, metadata, path, depth);
}

function serializeObject(value: object, metadata: SafeSerializeMetadata, path: string, depth: number): unknown {
	const seen = getSeen();
	if (seen.has(value)) return "[Circular]";
	seen.add(value);
	try {
		if (Array.isArray(value)) {
			const items = value
				.slice(0, DEFAULT_MAX_ARRAY)
				.map((item, index) => safeSerialize(item, metadata, `${path}[${index}]`, depth + 1));
			if (value.length > DEFAULT_MAX_ARRAY) metadata.truncatedPaths.push(path);
			return items;
		}
		const record: Record<string, unknown> = {};
		const entries = Object.entries(value).slice(0, DEFAULT_MAX_OBJECT_KEYS);
		for (const [key, entryValue] of entries) {
			record[key] = safeSerialize(entryValue, metadata, `${path}.${key}`, depth + 1);
		}
		if (Object.keys(value).length > DEFAULT_MAX_OBJECT_KEYS) metadata.truncatedPaths.push(path);
		return record;
	} finally {
		seen.delete(value);
	}
}

let currentSeen: WeakSet<object> | undefined;
function getSeen(): WeakSet<object> {
	currentSeen ??= new WeakSet<object>();
	return currentSeen;
}

function truncateString(value: string, metadata: SafeSerializeMetadata, path: string): string {
	if (value.length <= DEFAULT_MAX_STRING) return value;
	metadata.truncatedPaths.push(path);
	return `${value.slice(0, DEFAULT_MAX_STRING)}...[truncated ${value.length - DEFAULT_MAX_STRING} chars]`;
}

export function toJsonLine(value: unknown): string {
	currentSeen = undefined;
	return `${JSON.stringify(value)}\n`;
}
