import { parseThinkingLevel, type StructuredReceipt, withStructuredReceipt } from "@tsuuanmi/pi-agent";
import type { SubagentContext, SubagentDetails } from "#orchestrator/subagent/context";
import { renderSubagentProgress } from "#orchestrator/subagent/progress";
import { createSubagentListReceipt, createSubagentReceipt } from "#orchestrator/subagent/receipts";
import type {
	SubagentAwaitInput,
	SubagentIdInput,
	SubagentResumeInput,
	SubagentSpawnInput,
	SubagentStatusInput,
	SubagentSteerInput,
} from "#orchestrator/subagent/tool-schemas";
import type { SubagentDelivery, SubagentRecord } from "#orchestrator/subagent/types";

const RECEIPT_MAX = 280;
const PREVIEW_MAX = 2000;
const FULL_MAX = 12000;

type Verbosity = "receipt" | "preview" | "full";

export async function spawnSubagent(
	params: SubagentSpawnInput,
	context: SubagentContext,
	signal?: AbortSignal,
): Promise<{ content: [{ type: "text"; text: string }]; details: SubagentDetails }> {
	const prompt = "prompt" in params.task ? params.task.prompt : undefined;
	const promptFile = "promptFile" in params.task ? params.task.promptFile : undefined;
	const result = await context.manager.spawn({
		agent: params.agent,
		role: params.role,
		prompt,
		promptFile,
		model: params.model,
		thinkingLevel: parseThinkingLevel(params.thinkingLevel),
		systemPrompt: params.systemPrompt,
		tools: params.tools,
		excludeTools: params.excludeTools,
		persistent: params.persistent,
		detached: params.detached,
		maxDurationMs: params.maxDurationMs,
		label: params.label,
		outputArtifact: params.outputArtifact,
		metadata: params.metadata,
		cwd: context.cwd,
		parentSessionId: context.sessionId,
		storageSessionId: context.sessionId,
		signal,
	});
	const lines = [`Subagent ${result.record.id} ${result.record.status}`];
	const agent = result.record.agent_profile ?? params.agent ?? "default";
	lines.push(`agent: ${agent}`);
	if (result.record.model ?? params.model) lines.push(`model: ${result.record.model ?? params.model}`);
	const role = result.record.role;
	if (role) lines.push(`role: ${role}`);
	if (result.record.label ?? params.label) lines.push(`label: ${result.record.label ?? params.label}`);
	if (params.detached) lines.push("detached: true; poll with subagent_status or bounded subagent_await");
	lines.push(`session: ${sessionDescription(result.record)}`);
	lines.push(`task: ${promptFile ?? truncate(prompt, "receipt")}`);
	if (result.record.output_artifact) lines.push(`output artifact: ${result.record.output_artifact.path}`);
	return {
		content: [{ type: "text", text: lines.join("\n") }],
		details: withReceipt(
			{ ok: true, record: result.record, output: result.output },
			createSubagentReceipt(result.record, context.sessionId),
		),
	};
}

export async function status(
	params: SubagentStatusInput,
	context: SubagentContext,
): Promise<{ content: [{ type: "text"; text: string }]; details: SubagentDetails }> {
	const verbosity = parseVerbosity(params.verbosity);
	if (verbosity === "full" && !params.id) throw new Error("verbosity=full requires an explicit subagent id.");
	if (params.id) {
		const record = await context.manager.read(params.id, context.sessionId);
		return {
			content: [{ type: "text", text: formatRecord(record, verbosity) }],
			details: withReceipt(
				{ record: record ?? null },
				record ? createSubagentReceipt(record, context.sessionId) : undefined,
			),
		};
	}
	const limit = normalizeLimit(params.limit);
	const records = (await context.manager.list(context.sessionId)).slice(0, limit);
	const summary = records.map((record) => ({
		id: record.id,
		role: record.role,
		status: record.status,
		resumable: record.resumable,
		max_duration_ms: record.max_duration_ms,
		session_file: record.session_file,
		output: truncate(record.result_text?.trim() ? record.result_text : record.error_text, verbosity),
	}));
	return {
		content: [{ type: "text", text: JSON.stringify(summary, null, 2) }],
		details: withReceipt(
			{ records, recordReceipts: records.map((record) => createSubagentReceipt(record, context.sessionId)) },
			createSubagentListReceipt(context.sessionId, records.length),
		),
	};
}

export async function awaitRun(
	params: SubagentAwaitInput,
	context: SubagentContext,
): Promise<{ content: [{ type: "text"; text: string }]; details: SubagentDetails }> {
	const verbosity = parseVerbosity(params.verbosity);
	const result = await context.manager.waitFor(params.id, {
		timeoutMs: params.timeoutMs,
		sessionId: context.sessionId,
	});
	if (!result.ok) {
		const progressText = result.progress ? `\n\n${renderSubagentProgress(result.progress)}` : "";
		return {
			content: [
				{
					type: "text",
					text:
						result.reason === "timeout"
							? `Subagent ${params.id} await timed out after ${params.timeoutMs}ms${progressText}`
							: `Subagent ${params.id} not found`,
				},
			],
			details: withReceipt(
				{ ok: false, reason: result.reason, record: result.record },
				result.record ? createSubagentReceipt(result.record, context.sessionId) : undefined,
			),
		};
	}
	return {
		content: [{ type: "text", text: formatRecord(result.result.record, verbosity) }],
		details: withReceipt(
			{ ok: true, record: result.result.record, output: result.result.output },
			createSubagentReceipt(result.result.record, context.sessionId),
		),
	};
}

export async function resume(
	params: SubagentResumeInput,
	context: SubagentContext,
	signal?: AbortSignal,
): Promise<{ content: [{ type: "text"; text: string }]; details: SubagentDetails }> {
	const result = await context.manager.resume(params.id, params.message, {
		maxDurationMs: params.maxDurationMs,
		signal,
		storageSessionId: context.sessionId,
	});
	if (!result.ok) {
		return {
			content: [{ type: "text", text: `Subagent ${params.id} resume failed: ${result.reason}` }],
			details: withReceipt(
				{ ok: false, reason: result.reason, record: result.record },
				result.record ? createSubagentReceipt(result.record, context.sessionId) : undefined,
			),
		};
	}
	return {
		content: [{ type: "text", text: `Subagent ${result.result.record.id} ${result.result.record.status}` }],
		details: withReceipt(
			{ ok: true, record: result.result.record, output: result.result.output },
			createSubagentReceipt(result.result.record, context.sessionId),
		),
	};
}

export async function steer(
	params: SubagentSteerInput,
	context: SubagentContext,
): Promise<{ content: [{ type: "text"; text: string }]; details: SubagentDetails }> {
	const delivery = parseDelivery(params.delivery);
	const result = await context.manager.steer(params.id, params.message, delivery, context.sessionId);
	if (!result.ok) {
		return {
			content: [{ type: "text", text: `Subagent ${params.id} steer failed: ${result.reason}` }],
			details: withReceipt(
				{ ok: false, reason: result.reason, record: result.record },
				result.record ? createSubagentReceipt(result.record, context.sessionId) : undefined,
			),
		};
	}
	return {
		content: [{ type: "text", text: `Subagent ${result.result.record.id} steered` }],
		details: withReceipt(
			{ ok: true, record: result.result.record },
			createSubagentReceipt(result.result.record, context.sessionId),
		),
	};
}

export async function pause(
	params: SubagentIdInput,
	context: SubagentContext,
): Promise<{ content: [{ type: "text"; text: string }]; details: SubagentDetails }> {
	const result = await context.manager.pause(params.id, context.sessionId);
	return {
		content: [
			{
				type: "text",
				text: result.ok
					? `Subagent ${result.record?.id} paused`
					: `Subagent ${params.id} pause failed: ${result.reason}`,
			},
		],
		details: withReceipt(
			{ ok: result.ok, reason: result.reason, record: result.record },
			result.record ? createSubagentReceipt(result.record, context.sessionId) : undefined,
		),
	};
}

export async function cancel(
	params: SubagentIdInput,
	context: SubagentContext,
): Promise<{ content: [{ type: "text"; text: string }]; details: SubagentDetails }> {
	const record = await context.manager.cancel(params.id, context.sessionId);
	return {
		content: [
			{
				type: "text",
				text: record ? `Subagent ${record.id} cancelled` : `Subagent ${params.id} not found`,
			},
		],
		details: withReceipt(
			{ record: record ?? null },
			record ? createSubagentReceipt(record, context.sessionId) : undefined,
		),
	};
}

function sessionDescription(record: SubagentRecord): string {
	if (record.session_file) return record.session_file;
	if (!record.resumable) return "in-memory (no durable session file)";
	if (record.status === "queued" || record.status === "running") return "initializing durable session";
	return "durable session unavailable";
}

function parseVerbosity(value: string | undefined): Verbosity {
	if (value === undefined || value === "receipt" || value === "preview" || value === "full") {
		return value ?? "receipt";
	}
	throw new Error(`invalid subagent verbosity: ${value}`);
}

function parseDelivery(value: string | undefined): SubagentDelivery {
	if (value === undefined || value === "steer") return "steer";
	if (value === "followUp") return "followUp";
	throw new Error(`invalid subagent delivery: ${value}`);
}

function normalizeLimit(value: number | undefined): number {
	return Math.max(1, Math.min(50, Math.floor(value ?? 10)));
}

function formatRecord(record: SubagentRecord | undefined, verbosity: Verbosity): string {
	if (!record) return "Subagent not found";
	const output = truncate(record.result_text?.trim() ? record.result_text : record.error_text, verbosity);
	return JSON.stringify(
		{
			id: record.id,
			role: record.role,
			status: record.status,
			resumable: record.resumable,
			max_duration_ms: record.max_duration_ms,
			session_id: record.session_id,
			session_file: record.session_file,
			created_at: record.created_at,
			updated_at: record.updated_at,
			...(output ? { output } : {}),
		},
		null,
		2,
	);
}

function truncate(text: string | undefined, verbosity: Verbosity): string {
	if (!text) return "";
	const max = verbosity === "full" ? FULL_MAX : verbosity === "preview" ? PREVIEW_MAX : RECEIPT_MAX;
	if (text.length <= max) return text;
	return `${text.slice(0, max)}\n...[truncated]`;
}

function withReceipt(fields: SubagentDetails, receipt?: StructuredReceipt): SubagentDetails {
	return receipt ? withStructuredReceipt(fields, receipt) : fields;
}
