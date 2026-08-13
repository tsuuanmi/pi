import type { SubagentRecord } from "@tsuuanmi/pi-orchestrator";
import { refreshHudUi } from "@tsuuanmi/pi-tui";
import { getDeepInterviewMutationDecision } from "#workflows/skills/deep-interview/mutation-guard";
import { assertRalplanSubagentSpawn, recordRalplanAgentExecution } from "#workflows/skills/ralplan/agent-execution";
import { assertUltragoalSubagentSpawn } from "#workflows/skills/ultragoal/agent-execution";
import { readWorkflowState } from "#workflows/state/workflow-state";
import type { WorkflowSubagentSpawnInput } from "#workflows/tool/subagent-spawn";

export interface WorkflowUi {
	setStatus?: (key: string, text: string | undefined) => void;
}

export interface WorkflowSessionManager {
	getSessionId(): string;
}

export interface WorkflowHookContext {
	cwd: string;
	sessionManager: WorkflowSessionManager;
	skipAutomaticContinuation?: boolean;
	ui?: WorkflowUi;
}

export interface WorkflowToolCall {
	toolName: string;
	input: unknown;
}

export interface WorkflowToolResult {
	toolName: string;
	content: Array<{ type: "text"; text: string }>;
	details: unknown;
	isError: boolean;
}

export interface WorkflowToolResultPatch {
	content?: Array<{ type: "text"; text: string }>;
	details?: unknown;
	isError?: boolean;
}

export interface WorkflowHookResult {
	block: true;
	reason: string;
}

export type WorkflowHook<TEvent, TResult = undefined> = (
	event: TEvent,
	context: WorkflowHookContext,
) => TResult | Promise<TResult>;

export interface WorkflowHookHost {
	on(event: "session_start", handler: WorkflowHook<unknown>): void;
	on(event: "turn_end", handler: WorkflowHook<unknown>): void;
	on(event: "tool_execution_end", handler: WorkflowHook<unknown>): void;
	on(event: "before_agent_start", handler: WorkflowHook<unknown>): void;
	on(event: "tool_call", handler: WorkflowHook<WorkflowToolCall, WorkflowHookResult | undefined>): void;
	on(event: "tool_result", handler: WorkflowHook<WorkflowToolResult, WorkflowToolResultPatch | undefined>): void;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

async function refreshHud(_event: unknown, context: WorkflowHookContext): Promise<undefined> {
	await refreshHudUi(context);
	return undefined;
}

async function refreshBeforeAgent(_event: unknown, context: WorkflowHookContext): Promise<undefined> {
	if (context.skipAutomaticContinuation) return undefined;
	await refreshHudUi(context);
	return undefined;
}

export function registerWorkflowHooks(host: WorkflowHookHost): void {
	host.on("session_start", refreshHud);
	host.on("turn_end", refreshHud);
	host.on("tool_execution_end", refreshHud);
	host.on("before_agent_start", refreshBeforeAgent);

	host.on("tool_result", recordWorkflowAgentExecution);

	host.on("tool_call", async (event, context) => {
		if (event.toolName === "subagent_spawn") {
			if (!isRecord(event.input)) throw new Error("subagent_spawn input must be an object");
			const input = event.input as WorkflowSubagentSpawnInput;
			const sessionId = context.sessionManager.getSessionId();
			if (await assertRalplanSubagentSpawn(input, context.cwd, sessionId)) return undefined;
			if (await assertUltragoalSubagentSpawn(input, context.cwd, sessionId)) return undefined;
			const [ralplanState, ultragoalState] = await Promise.all([
				readWorkflowState(context.cwd, "ralplan", { sessionId }),
				readWorkflowState(context.cwd, "ultragoal", { sessionId }),
			]);
			if (ralplanState?.active === true) throw new Error("active ralplan execution requires workflow metadata");
			if (ultragoalState?.active === true) throw new Error("active ultragoal execution requires workflow metadata");
			return undefined;
		}
		if (event.toolName !== "edit" && event.toolName !== "write" && event.toolName !== "bash") return undefined;
		if (!isRecord(event.input)) throw new Error("Workflow tool_call input must be an object");

		const decision = await getDeepInterviewMutationDecision({
			cwd: context.cwd,
			sessionId: context.sessionManager.getSessionId(),
			toolName: event.toolName,
			input: event.input,
		});
		if (!decision.blocked) return undefined;
		if (!decision.message) throw new Error("Blocked workflow mutation decision missing message");
		return { block: true, reason: decision.message };
	});
}

async function recordWorkflowAgentExecution(
	event: WorkflowToolResult,
	context: WorkflowHookContext,
): Promise<WorkflowToolResultPatch | undefined> {
	if (event.isError || (event.toolName !== "subagent_spawn" && event.toolName !== "subagent_await")) return undefined;
	const record = readSubagentRecord(event.details);
	if (!record) return undefined;
	const error = await recordRalplanAgentExecution(context.cwd, context.sessionManager.getSessionId(), record);
	if (!error) return undefined;
	return {
		content: [{ type: "text", text: error }],
		details: event.details,
		isError: true,
	};
}

function readSubagentRecord(details: unknown): SubagentRecord | undefined {
	if (!isRecord(details) || !isRecord(details.record)) return undefined;
	return details.record as unknown as SubagentRecord;
}
