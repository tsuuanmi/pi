const TASK_METADATA_KEY = /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/;
const RESERVED_METADATA_PREFIXES = ["oma.", "pi."];
const MAX_METADATA_ENTRIES = 32;
const MAX_METADATA_DEPTH = 4;
const MAX_METADATA_ARRAY_LENGTH = 32;
const MAX_METADATA_STRING_LENGTH = 2048;
const SENSITIVE_KEY_PATTERN =
	/(^|[_.-])(api[-_.]?key|auth|bearer|credential|password|secret|token|private[-_.]?key)([_.-]|$)/i;
const SENSITIVE_VALUE_PATTERNS: readonly RegExp[] = [
	/\b(Bearer\s+)[A-Za-z0-9._~+/=-]+/gi,
	/\b(api[-_ ]?key|token|password|secret)\s*[:=]\s*[^\s,;]+/gi,
];

function isPlainRecord(value: unknown): value is Readonly<Record<string, unknown>> {
	if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
	const prototype = Object.getPrototypeOf(value);
	return prototype === Object.prototype || prototype === null;
}

function redactSensitiveText(value: string): string {
	let redacted = value;
	for (const pattern of SENSITIVE_VALUE_PATTERNS) {
		redacted = redacted.replace(pattern, (_match, prefix: string) => `${prefix}[REDACTED]`);
	}
	return redacted;
}

function validateMetadataKey(key: string, path: string): void {
	if (!TASK_METADATA_KEY.test(key)) {
		throw new Error(`${path} key "${key}" must match [A-Za-z][A-Za-z0-9_.-]{0,63}.`);
	}
	const lower = key.toLowerCase();
	for (const prefix of RESERVED_METADATA_PREFIXES) {
		if (lower.startsWith(prefix)) throw new Error(`${path} key "${key}" uses reserved prefix "${prefix}".`);
	}
	if (SENSITIVE_KEY_PATTERN.test(key)) {
		throw new Error(`${path} key "${key}" is credential-like and is not allowed.`);
	}
}

function normalizeMetadataValue(value: unknown, path: string, depth: number): unknown {
	if ((Array.isArray(value) || isPlainRecord(value)) && depth >= MAX_METADATA_DEPTH) {
		throw new Error(`${path} exceeds maximum metadata depth ${MAX_METADATA_DEPTH}.`);
	}
	if (typeof value === "string") {
		if (value.length > MAX_METADATA_STRING_LENGTH) {
			throw new Error(`${path} string must contain at most ${MAX_METADATA_STRING_LENGTH} characters.`);
		}
		return redactSensitiveText(value);
	}
	if (typeof value === "boolean" || value === null) return value;
	if (typeof value === "number") {
		if (!Number.isFinite(value)) throw new Error(`${path} number must be finite.`);
		return value;
	}
	if (Array.isArray(value)) {
		if (value.length > MAX_METADATA_ARRAY_LENGTH) {
			throw new Error(`${path} array must contain at most ${MAX_METADATA_ARRAY_LENGTH} values.`);
		}
		return Object.freeze(value.map((item, index) => normalizeMetadataValue(item, `${path}[${index}]`, depth + 1)));
	}
	if (isPlainRecord(value)) {
		return normalizeMetadataRecord(value, path, depth + 1);
	}
	throw new Error(`${path} value is not JSON-serializable metadata.`);
}

function normalizeMetadataRecord(
	metadata: Readonly<Record<string, unknown>>,
	path: string,
	depth: number,
): Readonly<Record<string, unknown>> {
	const entries = Object.entries(metadata);
	if (entries.length > MAX_METADATA_ENTRIES) {
		throw new Error(`${path} must contain at most ${MAX_METADATA_ENTRIES} entries.`);
	}

	const normalized: Array<readonly [string, unknown]> = [];
	for (const [key, value] of entries) {
		validateMetadataKey(key, path);
		normalized.push([key, normalizeMetadataValue(value, `${path}.${key}`, depth)]);
	}
	return Object.freeze(Object.fromEntries(normalized));
}

/** Validate, redact, and defensively copy task-scoped business metadata. */
export function validateTaskMetadata(
	metadata: Readonly<Record<string, unknown>> | undefined,
): Readonly<Record<string, unknown>> | undefined {
	if (metadata === undefined) return undefined;
	if (!isPlainRecord(metadata)) throw new Error("task metadata must be a plain record.");
	return normalizeMetadataRecord(metadata, "task metadata", 0);
}
