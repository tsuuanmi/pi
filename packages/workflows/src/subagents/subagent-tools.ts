import type { ExtensionAPI, ExtensionContext, SubagentVisibility } from "@tsuuanmi/pi-agent";
import { createSubagentListReceipt, createSubagentReceipt, renderSubagentProgress } from "@tsuuanmi/pi-agent";
import { type Static, Type } from "typebox";
import { workflowReceiptWithStructuredReceipt } from "#workflows/artifacts/artifacts";
import { assertAgentThinkingLevel, requireSubagentManager } from "#workflows/orchestration/workflow-tool-utils";

const subagentSpawnSchema = Type.Object({
	agent: Type.Optional(
		Type.String({ description: "Agent profile name from .agent/agents, .agents/agents, or built-ins." }),
	),
	role: Type.Optional(
		Type.String({ description: "Subagent role label. Defaults to agent profile name or subagent." }),
	),
	prompt: Type.String({ description: "User task prompt for the subagent." }),
	model: Type.Optional(Type.String({ description: "Override agent profile model as provider/model." })),
	thinkingLevel: Type.Optional(Type.String({ description: "Override agent profile thinking level." })),
	systemPrompt: Type.Optional(Type.String({ description: "Additional role/system instructions." })),
	tools: Type.Optional(Type.Array(Type.String({ description: "Allowed tool names for this subagent." }))),
	excludeTools: Type.Optional(Type.Array(Type.String({ description: "Tool names to disable for this subagent." }))),
	persistent: Type.Optional(
		Type.Boolean({ description: "Defaults to profile or true. False uses an in-memory session." }),
	),
	detached: Type.Optional(Type.Boolean({ description: "Return immediately after spawning." })),
	label: Type.Optional(Type.String({ description: "Human-readable subagent label." })),
	visibility: Type.Optional(
		Type.String({
			description:
				"Visibility preference: native (default) uses Pi receipts/status, tmux requests an explicit tmux-visible panel, auto lets the runner choose.",
		}),
	),
});
type SubagentSpawnInput = Static<typeof subagentSpawnSchema>;

const subagentIdSchema = Type.Object({
	id: Type.String({ description: "Subagent id." }),
});
type SubagentIdInput = Static<typeof subagentIdSchema>;

const subagentStatusSchema = Type.Object({
	id: Type.Optional(Type.String({ description: "Subagent id. Omit to list recent records." })),
	limit: Type.Optional(Type.Number({ description: "Maximum records when listing. Defaults to 10." })),
	verbosity: Type.Optional(
		Type.String({
			description: "Output verbosity: receipt (default, truncated), preview (<=2000 chars), or full (requires id).",
		}),
	),
});
type SubagentStatusInput = Static<typeof subagentStatusSchema>;

const subagentAwaitSchema = Type.Object({
	id: Type.String({ description: "Subagent id." }),
	timeoutMs: Type.Optional(
		Type.Number({ description: "Await timeout in milliseconds. Returns reason=timeout when exceeded." }),
	),
	verbosity: Type.Optional(
		Type.String({ description: "Output verbosity: receipt (default, truncated), preview (<=2000 chars), or full." }),
	),
});
type SubagentAwaitInput = Static<typeof subagentAwaitSchema>;

const subagentResumeSchema = Type.Object({
	id: Type.String({ description: "Subagent id." }),
	message: Type.String({ description: "Follow-up message to resume the saved subagent context." }),
});
type SubagentResumeInput = Static<typeof subagentResumeSchema>;

const subagentSteerSchema = Type.Object({
	id: Type.String({ description: "Subagent id." }),
	message: Type.String({ description: "Steering message to inject into the live subagent." }),
	delivery: Type.Optional(Type.String({ description: "steer (default) or followUp delivery mode." })),
});
type SubagentSteerInput = Static<typeof subagentSteerSchema>;

const subagentPauseSchema = Type.Object({
	id: Type.String({ description: "Subagent id." }),
});
type SubagentPauseInput = Static<typeof subagentPauseSchema>;

const RECEIPT_MAX = 280;
const PREVIEW_MAX = 2000;
const FULL_MAX = 12000;
type SubagentVerbosity = "receipt" | "preview" | "full";

function normalizeSubagentVisibility(value: string | undefined): SubagentVisibility | undefined {
	if (value === undefined) return undefined;
	if (value === "native" || value === "tmux" || value === "auto") return value;
	throw new Error(`invalid subagent visibility: ${value}`);
}

function normalizeSubagentVerbosity(value: string | undefined): SubagentVerbosity {
	if (value === undefined) return "receipt";
	if (value === "receipt" || value === "preview" || value === "full") return value;
	throw new Error(`invalid subagent verbosity: ${value}`);
}

function truncateOutput(text: string | undefined, verbosity: SubagentVerbosity): string {
	if (!text) return "";
	const max = verbosity === "full" ? FULL_MAX : verbosity === "preview" ? PREVIEW_MAX : RECEIPT_MAX;
	if (text.length <= max) return text;
	return `${text.slice(0, max)}\n...[truncated]`;
}

function formatSubagentRecord(
	record:
		| {
				id: string;
				role: string;
				status: string;
				created_at?: string;
				updated_at?: string;
				result_text?: string;
				error_text?: string;
				session_file?: string;
		  }
		| undefined,
	verbosity: SubagentVerbosity,
): string {
	if (!record) return "Subagent not found";
	const output = truncateOutput(record.result_text ?? record.error_text, verbosity);
	return JSON.stringify(
		{
			id: record.id,
			role: record.role,
			status: record.status,
			created_at: record.created_at,
			updated_at: record.updated_at,
			...(output ? { output } : {}),
			...(record.session_file ? { session_file: record.session_file } : {}),
		},
		null,
		2,
	);
}

async function executeSubagentSpawn(params: SubagentSpawnInput, ctx: ExtensionContext, signal?: AbortSignal) {
	assertAgentThinkingLevel(params.thinkingLevel);
	const result = await requireSubagentManager(ctx).spawn({
		agent: params.agent,
		role: params.role,
		prompt: params.prompt,
		model: params.model,
		thinkingLevel: params.thinkingLevel,
		systemPrompt: params.systemPrompt,
		tools: params.tools,
		excludeTools: params.excludeTools,
		persistent: params.persistent,
		detached: params.detached,
		label: params.label,
		parentSessionId: ctx.sessionManager.getSessionId(),
		storageSessionId: ctx.sessionManager.getSessionId(),
		visibility: normalizeSubagentVisibility(params.visibility),
		signal,
	});
	const lines = [`Subagent ${result.record.id} ${result.record.status}`];
	const agent = result.record.agent_profile ?? params.agent ?? "default";
	lines.push(`agent: ${agent}`);
	if (result.record.model ?? params.model) lines.push(`model: ${result.record.model ?? params.model}`);
	const role = result.record.role ?? params.role;
	if (role) lines.push(`role: ${role}`);
	if (result.record.label ?? params.label) lines.push(`label: ${result.record.label ?? params.label}`);
	if (params.detached) lines.push(`detached: true`);
	lines.push(`task: ${truncateOutput(params.prompt, "receipt")}`);
	return {
		content: [{ type: "text" as const, text: lines.join("\n") }],
		details: workflowReceiptWithStructuredReceipt(
			{ record: result.record, output: result.output },
			createSubagentReceipt(result.record, ctx.sessionManager.getSessionId()),
		),
	};
}

async function executeSubagentStatus(params: SubagentStatusInput, ctx: ExtensionContext) {
	const manager = requireSubagentManager(ctx);
	const verbosity = normalizeSubagentVerbosity(params.verbosity);
	if (verbosity === "full" && !params.id) {
		throw new Error("verbosity=full requires an explicit subagent id.");
	}
	const sessionId = ctx.sessionManager.getSessionId();
	if (params.id) {
		const record = await manager.read(params.id, sessionId);
		return {
			content: [{ type: "text" as const, text: formatSubagentRecord(record, verbosity) }],
			details: workflowReceiptWithStructuredReceipt(
				{ record: record ?? null },
				record ? createSubagentReceipt(record, sessionId) : undefined,
			),
		};
	}
	const limit = Math.max(1, Math.min(50, Math.floor(params.limit ?? 10)));
	const records = (await manager.list(sessionId)).slice(0, limit);
	const summary = records.map((r) => ({
		id: r.id,
		role: r.role,
		status: r.status,
		output: truncateOutput(r.result_text ?? r.error_text, verbosity),
	}));
	return {
		content: [{ type: "text" as const, text: JSON.stringify(summary, null, 2) }],
		details: workflowReceiptWithStructuredReceipt(
			{ records, recordReceipts: records.map((record) => createSubagentReceipt(record, sessionId)) },
			createSubagentListReceipt(sessionId, records.length),
		),
	};
}

async function executeSubagentAwait(params: SubagentAwaitInput, ctx: ExtensionContext) {
	const manager = requireSubagentManager(ctx);
	const verbosity = normalizeSubagentVerbosity(params.verbosity);
	const result = await manager.waitFor(params.id, {
		timeoutMs: params.timeoutMs,
		sessionId: ctx.sessionManager.getSessionId(),
	});
	if (!result.ok) {
		const progressText = result.progress ? `\n\n${renderSubagentProgress(result.progress)}` : "";
		return {
			content: [
				{
					type: "text" as const,
					text:
						result.reason === "timeout"
							? `Subagent ${params.id} await timed out after ${params.timeoutMs}ms${progressText}`
							: `Subagent ${params.id} not found`,
				},
			],
			details: workflowReceiptWithStructuredReceipt(
				{ ok: false, reason: result.reason, record: result.record },
				result.record ? createSubagentReceipt(result.record, ctx.sessionManager.getSessionId()) : undefined,
			),
		};
	}
	return {
		content: [{ type: "text" as const, text: formatSubagentRecord(result.result.record, verbosity) }],
		details: workflowReceiptWithStructuredReceipt(
			{ ok: true, record: result.result.record, output: result.result.output },
			createSubagentReceipt(result.result.record, ctx.sessionManager.getSessionId()),
		),
	};
}

async function executeSubagentResume(params: SubagentResumeInput, ctx: ExtensionContext, signal?: AbortSignal) {
	const result = await requireSubagentManager(ctx).resume(params.id, params.message, {
		signal,
		storageSessionId: ctx.sessionManager.getSessionId(),
	});
	if (!result.ok) {
		return {
			content: [{ type: "text" as const, text: `Subagent ${params.id} resume failed: ${result.reason}` }],
			details: workflowReceiptWithStructuredReceipt(
				{ ok: false, reason: result.reason, record: result.record },
				result.record ? createSubagentReceipt(result.record, ctx.sessionManager.getSessionId()) : undefined,
			),
		};
	}
	return {
		content: [{ type: "text" as const, text: `Subagent ${result.result.record.id} ${result.result.record.status}` }],
		details: workflowReceiptWithStructuredReceipt(
			{ ok: true, record: result.result.record, output: result.result.output },
			createSubagentReceipt(result.result.record, ctx.sessionManager.getSessionId()),
		),
	};
}

async function executeSubagentSteer(params: SubagentSteerInput, ctx: ExtensionContext) {
	const delivery = params.delivery === "followUp" ? "followUp" : "steer";
	const result = await requireSubagentManager(ctx).steer(
		params.id,
		params.message,
		delivery,
		ctx.sessionManager.getSessionId(),
	);
	if (!result.ok) {
		return {
			content: [{ type: "text" as const, text: `Subagent ${params.id} steer failed: ${result.reason}` }],
			details: workflowReceiptWithStructuredReceipt(
				{ ok: false, reason: result.reason, record: result.record },
				result.record ? createSubagentReceipt(result.record, ctx.sessionManager.getSessionId()) : undefined,
			),
		};
	}
	return {
		content: [{ type: "text" as const, text: `Subagent ${result.result.record.id} steered` }],
		details: workflowReceiptWithStructuredReceipt(
			{ ok: true, record: result.result.record },
			createSubagentReceipt(result.result.record, ctx.sessionManager.getSessionId()),
		),
	};
}

async function executeSubagentPause(params: SubagentPauseInput, ctx: ExtensionContext) {
	const result = await requireSubagentManager(ctx).pause(params.id, ctx.sessionManager.getSessionId());
	return {
		content: [
			{
				type: "text" as const,
				text: result.ok
					? `Subagent ${result.record?.id} paused`
					: `Subagent ${params.id} pause failed: ${result.reason}`,
			},
		],
		details: workflowReceiptWithStructuredReceipt(
			{ ok: result.ok, reason: result.reason, record: result.record },
			result.record ? createSubagentReceipt(result.record, ctx.sessionManager.getSessionId()) : undefined,
		),
	};
}

async function executeSubagentCancel(params: SubagentIdInput, ctx: ExtensionContext) {
	const record = await requireSubagentManager(ctx).cancel(params.id, ctx.sessionManager.getSessionId());
	return {
		content: [
			{
				type: "text" as const,
				text: record ? `Subagent ${record.id} cancelled` : `Subagent ${params.id} not found`,
			},
		],
		details: workflowReceiptWithStructuredReceipt(
			{ record: record ?? null },
			record ? createSubagentReceipt(record, ctx.sessionManager.getSessionId()) : undefined,
		),
	};
}

export function registerSubagentTools(pi: ExtensionAPI): void {
	pi.registerTool({
		name: "subagent_spawn",
		label: "Subagent Spawn",
		description: "Spawn a Pi-native subagent session with optional restricted tools and persistence.",
		promptSnippet: "Spawn a durable Pi subagent for isolated work",
		promptGuidelines: [
			"Use subagent_spawn when work should run in an isolated agent context. Its records and persistent session logs are stored under the current Pi session id.",
			"subagent_spawn is not an attachable tmux pane. If the user explicitly asks for a tmux-visible agent panel, use an explicit tmux session and surface the attach/list/cleanup commands; otherwise inspect Pi-native subagents with subagent_status/subagent_await.",
		],
		parameters: subagentSpawnSchema,
		execute: async (_toolCallId, params, signal, _onUpdate, ctx) => executeSubagentSpawn(params, ctx, signal),
	});

	pi.registerTool({
		name: "subagent_status",
		label: "Subagent Status",
		description: "Read one subagent record or list recent subagent records.",
		promptSnippet: "Inspect Pi-native subagent records",
		promptGuidelines: ["Use subagent_status before resuming or auditing subagent work."],
		parameters: subagentStatusSchema,
		execute: async (_toolCallId, params, _signal, _onUpdate, ctx) => executeSubagentStatus(params, ctx),
	});

	pi.registerTool({
		name: "subagent_await",
		label: "Subagent Await",
		description: "Await a live subagent or read its terminal result.",
		promptSnippet: "Await Pi-native subagent completion",
		promptGuidelines: ["Use subagent_await to collect a detached subagent result before integrating it."],
		parameters: subagentAwaitSchema,
		execute: async (_toolCallId, params, _signal, _onUpdate, ctx) => executeSubagentAwait(params, ctx),
	});

	pi.registerTool({
		name: "subagent_steer",
		label: "Subagent Steer",
		description: "Inject a steering message into a live subagent or resume it from saved context.",
		promptSnippet: "Steer a live Pi-native subagent",
		promptGuidelines: ["Use subagent_steer to redirect a running or saved subagent without restarting its context."],
		parameters: subagentSteerSchema,
		execute: async (_toolCallId, params, _signal, _onUpdate, ctx) => executeSubagentSteer(params, ctx),
	});

	pi.registerTool({
		name: "subagent_pause",
		label: "Subagent Pause",
		description: "Pause a running subagent at a safe boundary; its saved context remains resumable.",
		promptSnippet: "Pause a running Pi-native subagent",
		promptGuidelines: ["Use subagent_pause to suspend a subagent so it can be resumed later from its saved context."],
		parameters: subagentPauseSchema,
		execute: async (_toolCallId, params, _signal, _onUpdate, ctx) => executeSubagentPause(params, ctx),
	});

	pi.registerTool({
		name: "subagent_resume",
		label: "Subagent Resume",
		description: "Resume a saved persistent subagent session with a follow-up message.",
		promptSnippet: "Resume a Pi-native subagent from saved context",
		promptGuidelines: ["Use subagent_resume when a previous persistent subagent should continue from its context."],
		parameters: subagentResumeSchema,
		execute: async (_toolCallId, params, signal, _onUpdate, ctx) => executeSubagentResume(params, ctx, signal),
	});

	pi.registerTool({
		name: "subagent_cancel",
		label: "Subagent Cancel",
		description: "Cancel a live or durable subagent record.",
		promptSnippet: "Cancel a Pi-native subagent",
		promptGuidelines: ["Use subagent_cancel to stop work that should no longer continue."],
		parameters: subagentIdSchema,
		execute: async (_toolCallId, params, _signal, _onUpdate, ctx) => executeSubagentCancel(params, ctx),
	});
}
