import type { ExtensionAPI, ExtensionContext, ToolResultHook, ToolResultHookResult } from "@tsuuanmi/pi/extensions";
import type { SubagentRecord } from "@tsuuanmi/pi-orchestrator";
import { refreshHudUi } from "@tsuuanmi/pi-tui";
import { getDeepInterviewMutationDecision } from "#workflows/skills/deep-interview/mutation-guard";
import { assertRalplanSubagentSpawn, recordRalplanAgentExecution } from "#workflows/skills/ralplan/agent-execution";
import { assertUltragoalSubagentSpawn } from "#workflows/skills/ultragoal/agent-execution";
import { readWorkflowState } from "#workflows/state/workflow-state";
import type { WorkflowSubagentSpawnInput } from "#workflows/tool/subagent-spawn";

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

async function refreshHud(_event: unknown, context: ExtensionContext): Promise<void> {
	await refreshHudUi(context);
}

async function refreshBeforeAgent(_hook: unknown, context: ExtensionContext): Promise<void> {
	if (context.skipAutomaticContinuation) return;
	await refreshHudUi(context);
}

export function registerWorkflowHooks(host: Pick<ExtensionAPI, "on" | "onHook">): void {
	host.on("session_start", refreshHud);
	host.on("turn_end", refreshHud);
	host.on("tool_execution_end", refreshHud);
	host.onHook("before_agent_start", refreshBeforeAgent);

	host.onHook("tool_result", recordWorkflowAgentExecution);

	host.onHook("tool_call", async (hook, context) => {
		if (hook.toolName === "subagent_spawn") {
			if (!isRecord(hook.input)) throw new Error("subagent_spawn input must be an object");
			const input = hook.input as WorkflowSubagentSpawnInput;
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
		if (hook.toolName !== "edit" && hook.toolName !== "write" && hook.toolName !== "bash") return undefined;

		const decision = await getDeepInterviewMutationDecision({
			cwd: context.cwd,
			sessionId: context.sessionManager.getSessionId(),
			toolName: hook.toolName,
			input: hook.input,
		});
		if (!decision.blocked) return undefined;
		if (!decision.message) throw new Error("Blocked workflow mutation decision missing message");
		return { block: true, reason: decision.message };
	});
}

async function recordWorkflowAgentExecution(
	hook: ToolResultHook,
	context: ExtensionContext,
): Promise<ToolResultHookResult | undefined> {
	if (hook.isError || (hook.toolName !== "subagent_spawn" && hook.toolName !== "subagent_await")) return undefined;
	const record = readSubagentRecord(hook.details);
	if (!record) return undefined;
	const error = await recordRalplanAgentExecution(context.cwd, context.sessionManager.getSessionId(), record);
	if (!error) return undefined;
	return {
		content: [{ type: "text", text: error }],
		details: hook.details,
		isError: true,
	};
}

function readSubagentRecord(details: unknown): SubagentRecord | undefined {
	if (!isRecord(details) || !isRecord(details.record)) return undefined;
	return details.record as unknown as SubagentRecord;
}
