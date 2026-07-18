import type { ExtensionAPI, ExtensionContext } from "@tsuuanmi/pi-agent";
import { type Static, Type } from "typebox";
import {
	assertExpectedNextRole,
	assertNoGuardedSpawnOverrides,
	expectedNextTeamRole,
} from "../shared/expected-next-role.ts";
import { workflowReceipt } from "../shared/receipts.ts";
import { assertAgentThinkingLevel, requireSubagentManager } from "../shared/workflow-tool-utils.ts";
import { readTeamSnapshot } from "./team-runtime.ts";

const teamSpawnTaskAgentSchema = Type.Object({
	teamId: Type.Optional(Type.String({ description: "Team run id. Defaults to the active team." })),
	taskId: Type.String({ description: "Task id to assign to the subagent." }),
	agent: Type.Optional(Type.String({ description: "Agent profile name. Defaults to worker." })),
	model: Type.Optional(Type.String({ description: "Override agent profile model as provider/model." })),
	thinkingLevel: Type.Optional(Type.String({ description: "Override agent profile thinking level." })),
	tools: Type.Optional(Type.Array(Type.String({ description: "Allowed tool names for the subagent." }))),
	excludeTools: Type.Optional(Type.Array(Type.String({ description: "Tool names to disable for the subagent." }))),
});
type TeamSpawnTaskAgentInput = Static<typeof teamSpawnTaskAgentSchema>;

async function executeTeamSpawnTaskAgent(params: TeamSpawnTaskAgentInput, ctx: ExtensionContext, signal?: AbortSignal) {
	assertAgentThinkingLevel(params.thinkingLevel);
	const snapshot = await readTeamSnapshot(ctx.cwd, ctx.sessionManager.getSessionId(), params.teamId);
	const task = snapshot.tasks.find((t) => t.id === params.taskId);
	if (!task) throw new Error(`team task not found: ${params.taskId}`);
	const expected = expectedNextTeamRole(snapshot);
	if (!expected) {
		throw new Error("no legal next team task to spawn: all tasks are completed or none are actionable");
	}
	assertExpectedNextRole(expected, {
		skill: "team",
		stage: "task-worker",
		role: params.agent ?? "worker",
		owner: "team_spawn_task_agent",
		teamId: snapshot.team_id,
		taskId: task.id,
	});
	assertNoGuardedSpawnOverrides(params);
	const result = await requireSubagentManager(ctx).spawn({
		agent: "worker",
		role: `team-worker-${task.id}`,
		model: undefined,
		thinkingLevel: undefined,
		prompt: `Execute team task "${task.title}": ${task.description}${task.owner ? ` (owner: ${task.owner})` : ""}`,
		systemPrompt: `You are a team worker executing task "${task.title}" (id: ${task.id}). Follow the task description precisely and report completion with evidence.`,
		tools: undefined,
		excludeTools: undefined,
		persistent: true,
		label: `team-${snapshot.team_id}-${task.id}`,
		parentSessionId: ctx.sessionManager.getSessionId(),
		storageSessionId: ctx.sessionManager.getSessionId(),
		signal,
	});
	return {
		content: [{ type: "text" as const, text: `Spawned subagent ${result.record.id} for task ${task.id}` }],
		details: workflowReceipt({ task, subagent: result.record }),
	};
}

export function registerTeamTools(pi: ExtensionAPI): void {
	pi.registerTool({
		name: "team_spawn_task_agent",
		label: "Team Spawn Task Agent",
		description: "Spawn a subagent to execute a team task.",
		promptSnippet: "Spawn agent for team task",
		promptGuidelines: ["Use team_spawn_task_agent to assign a team task to an autonomous subagent worker."],
		parameters: teamSpawnTaskAgentSchema,
		execute: async (_toolCallId, params, signal, _onUpdate, ctx) => executeTeamSpawnTaskAgent(params, ctx, signal),
	});
}
