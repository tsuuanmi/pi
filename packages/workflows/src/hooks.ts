import { refreshHudUi } from "@tsuuanmi/pi-tui";
import { getDeepInterviewMutationDecision } from "#workflows/skills/deep-interview/mutation-guard";

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

	host.on("tool_call", async (event, context) => {
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
