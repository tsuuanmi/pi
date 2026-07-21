import {
	STRUCTURED_RECEIPT_VERSION,
	type StructuredReceipt,
	type StructuredReceiptInspectEntry,
	type StructuredReceiptSource,
	type StructuredReceiptStatus,
	withStructuredReceipt,
} from "@tsuuanmi/pi-agent";

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
