import {
	STRUCTURED_RECEIPT_VERSION,
	type StructuredReceipt,
	type StructuredReceiptInspectEntry,
	withStructuredReceipt,
} from "@tsuuanmi/pi-agent";
import type { SubagentRecord } from "#orchestrator/subagent/types";

function truncatePreview(value: string | undefined, limit = 240): string | undefined {
	if (!value) return undefined;
	if (value.length <= limit) return value;
	return `${value.slice(0, limit - 1)}…`;
}

export function createSubagentListReceipt(sessionId: string, count: number): StructuredReceipt {
	return {
		version: STRUCTURED_RECEIPT_VERSION,
		id: `subagent-list:${sessionId}`,
		source: "subagent",
		actionSummary: `Listed ${count} current-session subagent${count === 1 ? "" : "s"}`,
		status: "completed",
		location: { sessionId, records: count },
		timing: {},
		inspect: [{ label: "session", kind: "session", value: sessionId }],
	};
}

export function createSubagentReceipt(record: SubagentRecord, sessionId: string): StructuredReceipt {
	const inspect: StructuredReceiptInspectEntry[] = [{ label: "session", kind: "session", value: sessionId }];
	const startedAt = record.started_at;
	const endedAt = record.completed_at;
	const started = startedAt ? Date.parse(startedAt) : undefined;
	const ended = endedAt ? Date.parse(endedAt) : undefined;
	const location: StructuredReceipt["location"] = {
		sessionId,
		subagentId: record.id,
		role: record.role,
		status: record.status,
		resumable: record.resumable,
	};
	return {
		version: STRUCTURED_RECEIPT_VERSION,
		id: `subagent:${record.id}`,
		source: "subagent",
		actionSummary: `Subagent ${record.id} ${record.status}`,
		status: record.status,
		location,
		timing: {
			startedAt,
			endedAt,
			durationMs: started !== undefined && ended !== undefined ? Math.max(0, ended - started) : undefined,
		},
		inspect,
		outputPreview: truncatePreview(record.result_text),
		errorSummary: record.status === "failed" ? truncatePreview(record.error_text) : undefined,
		meta: {
			label: record.label,
			agent_profile: record.agent_profile,
			model: record.model,
			thinking_level: record.thinking_level,
			last_prompt_sha256: record.last_prompt_sha256,
		},
	};
}

export function attachControlReceipt<TDetails extends { record?: SubagentRecord }>(
	details: TDetails,
	sessionId: string,
): TDetails {
	if (!details.record) return details;
	return withStructuredReceipt(details, createSubagentReceipt(details.record, sessionId));
}
