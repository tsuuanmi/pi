import { refreshHudUi } from "@tsuuanmi/pi-tui";
import { getDeepInterviewMutationDecision } from "#workflows/skills/deep-interview/mutation-guard";
import { registerWorkflowTools, type WorkflowToolHost } from "#workflows/tools/workflow-tools";

interface WorkflowUi {
	setStatus?: (key: string, text: string | undefined) => void;
}

interface WorkflowSessionManager {
	getSessionId(): string;
}

interface WorkflowHookContext {
	cwd: string;
	sessionManager: WorkflowSessionManager;
	skipAutomaticContinuation?: boolean;
	ui?: WorkflowUi;
}

interface ToolCallEvent {
	toolName: string;
	input: unknown;
}

interface ToolCallResult {
	block: true;
	reason: string;
}

type WorkflowHookHandler<TEvent, TResult = undefined> = (
	event: TEvent,
	ctx: WorkflowHookContext,
) => TResult | Promise<TResult>;

export interface WorkflowHost extends WorkflowToolHost {
	on(event: "session_start", handler: WorkflowHookHandler<unknown>): void;
	on(event: "turn_end", handler: WorkflowHookHandler<unknown>): void;
	on(event: "tool_execution_end", handler: WorkflowHookHandler<unknown>): void;
	on(event: "before_agent_start", handler: WorkflowHookHandler<unknown>): void;
	on(event: "tool_call", handler: WorkflowHookHandler<ToolCallEvent, ToolCallResult | undefined>): void;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

async function refreshWorkflowHud(_event: unknown, ctx: WorkflowHookContext): Promise<undefined> {
	await refreshHudUi(ctx);
	return undefined;
}

async function refreshWorkflowHudBeforeAgent(_event: unknown, ctx: WorkflowHookContext): Promise<undefined> {
	if (ctx.skipAutomaticContinuation) return undefined;
	await refreshHudUi(ctx);
	return undefined;
}

export function registerWorkflows(host: WorkflowHost): void {
	registerWorkflowTools(host);

	host.on("session_start", refreshWorkflowHud);
	host.on("turn_end", refreshWorkflowHud);
	host.on("tool_execution_end", refreshWorkflowHud);
	host.on("before_agent_start", refreshWorkflowHudBeforeAgent);

	host.on("tool_call", async (event, ctx) => {
		if (event.toolName !== "edit" && event.toolName !== "write" && event.toolName !== "bash") return undefined;
		if (!isRecord(event.input)) throw new Error("Workflow tool_call input must be an object");
		const decision = await getDeepInterviewMutationDecision({
			cwd: ctx.cwd,
			sessionId: ctx.sessionManager.getSessionId(),
			toolName: event.toolName,
			input: event.input,
		});
		if (!decision.blocked) return undefined;
		if (!decision.message) throw new Error("Blocked workflow mutation decision missing message");
		return { block: true, reason: decision.message };
	});
}
