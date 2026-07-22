export const STRUCTURED_RECEIPT_VERSION = 1 as const;

export type StructuredReceiptSource = "builtin-tool" | "subagent" | "tmux";
export type StructuredReceiptStatus =
	| "queued"
	| "started"
	| "running"
	| "paused"
	| "completed"
	| "failed"
	| "cancelled";

export interface StructuredReceiptInspectEntry {
	label: string;
	kind: "command" | "path" | "session" | "tool-call" | "tmux";
	value: string;
}

export interface StructuredReceipt {
	version: 1;
	id: string;
	source: StructuredReceiptSource;
	actionSummary: string;
	status: StructuredReceiptStatus;
	location: Record<string, string | number | boolean>;
	timing: {
		startedAt?: string;
		endedAt?: string;
		durationMs?: number;
	};
	inspect: StructuredReceiptInspectEntry[];
	outputPreview?: string;
	errorSummary?: string;
	meta?: Record<string, unknown>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPrimitiveLocationValue(value: unknown): value is string | number | boolean {
	return typeof value === "string" || typeof value === "number" || typeof value === "boolean";
}

function isStructuredReceiptInspectEntry(value: unknown): value is StructuredReceiptInspectEntry {
	if (!isRecord(value)) return false;
	return (
		typeof value.label === "string" &&
		typeof value.kind === "string" &&
		(value.kind === "command" ||
			value.kind === "path" ||
			value.kind === "session" ||
			value.kind === "tool-call" ||
			value.kind === "tmux") &&
		typeof value.value === "string"
	);
}

export function isStructuredReceipt(value: unknown): value is StructuredReceipt {
	if (!isRecord(value)) return false;
	if (value.version !== STRUCTURED_RECEIPT_VERSION) return false;
	if (typeof value.id !== "string" || value.id.length === 0) return false;
	if (typeof value.source !== "string" || !["builtin-tool", "subagent", "tmux"].includes(value.source))
		return false;
	if (typeof value.actionSummary !== "string" || value.actionSummary.length === 0) return false;
	if (
		typeof value.status !== "string" ||
		!["queued", "started", "running", "paused", "completed", "failed", "cancelled"].includes(value.status)
	)
		return false;
	if (!isRecord(value.location)) return false;
	if (Array.isArray(value.location)) return false;
	if (!Object.values(value.location).every(isPrimitiveLocationValue)) return false;
	if (!isRecord(value.timing) || Array.isArray(value.timing)) return false;
	if (!Array.isArray(value.inspect) || !value.inspect.every(isStructuredReceiptInspectEntry)) return false;
	if (value.outputPreview !== undefined && typeof value.outputPreview !== "string") return false;
	if (value.errorSummary !== undefined && typeof value.errorSummary !== "string") return false;
	if (value.meta !== undefined && !isRecord(value.meta)) return false;
	return true;
}

export function assertStructuredReceipt(value: unknown): asserts value is StructuredReceipt {
	if (!isStructuredReceipt(value)) {
		throw new Error("invalid structured receipt");
	}
}

export function getStructuredReceipt(details: unknown): StructuredReceipt | undefined {
	if (!isRecord(details)) return undefined;
	const receipt = details.receipt;
	return isStructuredReceipt(receipt) ? receipt : undefined;
}

export function withStructuredReceipt<TDetails>(
	details: TDetails,
	receipt: StructuredReceipt,
): TDetails & { receipt: StructuredReceipt } {
	if (isRecord(details)) {
		return { ...details, receipt } as TDetails & { receipt: StructuredReceipt };
	}
	return { receipt } as TDetails & { receipt: StructuredReceipt };
}

export interface BuiltinToolReceiptInput {
	toolCallId: string;
	toolName: string;
	status: StructuredReceiptStatus;
	actionSummary: string;
	location: Record<string, string | number | boolean>;
	inspect: StructuredReceiptInspectEntry[];
	startedAt?: string;
	endedAt?: string;
	durationMs?: number;
	outputPreview?: string;
	errorSummary?: string;
	meta?: Record<string, unknown>;
}

export function createBuiltinToolReceipt(input: BuiltinToolReceiptInput): StructuredReceipt {
	return {
		version: STRUCTURED_RECEIPT_VERSION,
		id: `tool:${input.toolCallId}`,
		source: "builtin-tool" satisfies StructuredReceiptSource,
		actionSummary: input.actionSummary,
		status: input.status,
		location: {
			toolCallId: input.toolCallId,
			toolName: input.toolName,
			...input.location,
		},
		timing: {
			startedAt: input.startedAt,
			endedAt: input.endedAt,
			durationMs: input.durationMs,
		},
		inspect: input.inspect,
		outputPreview: input.outputPreview,
		errorSummary: input.errorSummary,
		meta: input.meta,
	};
}

export function attachBuiltinToolReceipt<TDetails>(
	details: TDetails,
	receipt: StructuredReceipt,
): TDetails & { receipt: StructuredReceipt } {
	return withStructuredReceipt(details, receipt);
}
