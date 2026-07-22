import type { SubagentRecord } from "#agent/harness/subagents/subagent-types";
import {
	STRUCTURED_RECEIPT_VERSION,
	type StructuredReceipt,
	type StructuredReceiptInspectEntry,
} from "#agent/receipts/structured-receipt";

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
	if (record.session_file) {
		inspect.push({ label: "session file", kind: "path", value: record.session_file });
	}
	if (record.artifact_file) {
		inspect.push({ label: "artifact", kind: "path", value: record.artifact_file });
	}
	if (record.tmux) {
		inspect.push(
			{ label: "attach", kind: "tmux", value: record.tmux.attach_command },
			{ label: "inspect", kind: "tmux", value: record.tmux.inspect_command },
			{ label: "cleanup", kind: "command", value: record.tmux.cleanup_command },
		);
	}
	const startedAt = record.started_at;
	const endedAt = record.completed_at;
	const started = startedAt ? Date.parse(startedAt) : undefined;
	const ended = endedAt ? Date.parse(endedAt) : undefined;
	return {
		version: STRUCTURED_RECEIPT_VERSION,
		id: `subagent:${record.id}`,
		source: "subagent",
		actionSummary: `Subagent ${record.id} ${record.status}`,
		status: record.status,
		location: {
			sessionId,
			subagentId: record.id,
			cwd: record.cwd,
			role: record.role,
			status: record.status,
			resumable: record.resumable,
			visibility: record.visibility ?? "native",
		},
		timing: {
			startedAt,
			endedAt,
			durationMs: started !== undefined && ended !== undefined ? Math.max(0, ended - started) : undefined,
		},
		inspect,
		outputPreview: truncatePreview(record.result_text),
		errorSummary: record.status === "failed" ? (truncatePreview(record.error_text) ?? "Subagent failed") : undefined,
		meta: {
			label: record.label,
			agent_profile: record.agent_profile,
			model: record.model,
			thinking_level: record.thinking_level,
			parent_session_id: record.parent_session_id,
			last_prompt_sha256: record.last_prompt_sha256,
			artifact_file: record.artifact_file,
			tmux: record.tmux,
		},
	};
}
