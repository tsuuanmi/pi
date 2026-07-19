import { join } from "node:path";
import type { AssistantMessage, Context, ProviderResponse, UsageProvenance } from "@tsuuanmi/pi-ai";
import { piSessionRoot } from "#coding-agent/session/session-layout";

const DEFAULT_MAX_DEPTH = 12;
const DEFAULT_MAX_ARRAY = 200;
const DEFAULT_MAX_OBJECT_KEYS = 200;
const DEFAULT_MAX_STRING = 20000;
const SENSITIVE_KEY =
	/(^|[-_])(authorization|cookie|set-cookie|api[-_]?key|access[-_]?token|refresh[-_]?token|id[-_]?token|secret|password|passwd|credential|signature|x-api-key|api_key)([-_]|$)/i;
const SECRET_TEXT =
	/(sk-[A-Za-z0-9_-]{16,}|[A-Za-z0-9_-]{24,}\.[A-Za-z0-9_-]{24,}\.[A-Za-z0-9_-]{24,}|Bearer\s+[A-Za-z0-9._\-+/=]{16,})/gi;
const REDACTED = "[REDACTED]";

export interface RedactionMetadata {
	redacted_paths: string[];
	truncated_paths: string[];
}

export interface SafeSerializeMetadata {
	truncatedPaths: string[];
}

export interface ApiUsageRecordV1 {
	schema_version: 1;
	started_at: string;
	completed_at: string;
	duration_ms: number;
	session_id: string;
	request_id: string;
	request_sequence: number;
	provider: string;
	model: string;
	api: string;
	transport?: string;
	response_model?: string;
	response_id?: string;
	status?: number;
	headers?: Record<string, string>;
	usage_provenance: UsageProvenance | { type: "provider_unavailable"; reason: "usage_provenance_missing" };
	usage_unavailable?: string;
	token_usage?: AssistantMessage["usage"];
	consumed_context: Context;
	request_context?: unknown;
	provider_payload?: unknown;
	response_summary?: unknown;
	redaction: RedactionMetadata;
}

export type ApiUsagePendingRequest = {
	requestId: string;
	requestSequence: number;
	startedAt: number;
	context: Context;
	provider: string;
	model: string;
	api: string;
	transport?: string;
	payload?: unknown;
	response?: ProviderResponse;
};

export function apiUsageLogPath(cwd: string, sessionId: string): string | undefined {
	const trimmed = sessionId.trim();
	if (!trimmed) return undefined;
	return join(piSessionRoot(cwd, trimmed), "api-usage.jsonl");
}

export function redactValue<T>(value: T, metadata: RedactionMetadata, path = "$", key?: string): T {
	if (key && SENSITIVE_KEY.test(key)) {
		metadata.redacted_paths.push(path);
		return REDACTED as T;
	}
	if (typeof value === "string") {
		const redacted = value.replace(SECRET_TEXT, () => {
			metadata.redacted_paths.push(path);
			return REDACTED;
		});
		return redacted as T;
	}
	if (!value || typeof value !== "object") return value;
	if (Array.isArray(value)) {
		return value.map((item, index) => redactValue(item, metadata, `${path}[${index}]`)) as T;
	}
	const output: Record<string, unknown> = {};
	for (const [entryKey, entryValue] of Object.entries(value)) {
		output[entryKey] = redactValue(entryValue, metadata, `${path}.${entryKey}`, entryKey);
	}
	return output as T;
}

export function safeHeaders(
	headers: Record<string, string> | undefined,
	metadata: RedactionMetadata,
): Record<string, string> | undefined {
	if (!headers) return undefined;
	const output: Record<string, string> = {};
	for (const [key, value] of Object.entries(headers)) {
		const lower = key.toLowerCase();
		if (
			[
				"content-type",
				"request-id",
				"x-request-id",
				"openai-processing-ms",
				"anthropic-ratelimit-requests-remaining",
			].includes(lower)
		) {
			output[key] = value;
		} else if (SENSITIVE_KEY.test(key)) {
			metadata.redacted_paths.push(`$.headers.${key}`);
			output[key] = REDACTED;
		}
	}
	return output;
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
