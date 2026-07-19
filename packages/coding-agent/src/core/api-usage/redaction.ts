import type { RedactionMetadata } from "#coding-agent/core/api-usage/types";

const SENSITIVE_KEY =
	/(^|[-_])(authorization|cookie|set-cookie|api[-_]?key|access[-_]?token|refresh[-_]?token|id[-_]?token|secret|password|passwd|credential|signature|x-api-key|api_key)([-_]|$)/i;
const SECRET_TEXT =
	/(sk-[A-Za-z0-9_-]{16,}|[A-Za-z0-9_-]{24,}\.[A-Za-z0-9_-]{24,}\.[A-Za-z0-9_-]{24,}|Bearer\s+[A-Za-z0-9._\-+/=]{16,})/gi;
const REDACTED = "[REDACTED]";

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
