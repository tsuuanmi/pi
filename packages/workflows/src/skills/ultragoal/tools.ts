import { parseThinkingLevel } from "@tsuuanmi/pi-agent";
import { type Static, Type } from "typebox";
import { workflowReceipt } from "#workflows/artifacts/artifacts";
import { assertExpectedNextRole, assertNoGuardedSpawnOverrides } from "#workflows/policy/expected-next-role";
import { nextRoleForSkill } from "#workflows/policy/skill-policy";
import { getUltragoalStatus } from "#workflows/skills/ultragoal/runtime";
import type { WorkflowContext } from "#workflows/tool/context";
import type { WorkflowToolHost } from "#workflows/tool/host";

const ultragoalSpawnGoalAgentSchema = Type.Object({
	goalId: Type.String({ description: "Goal id to assign to the subagent." }),
	agent: Type.Optional(Type.String({ description: "Agent profile name. Defaults to worker." })),
	model: Type.Optional(Type.String({ description: "Override agent profile model as provider/model." })),
	thinkingLevel: Type.Optional(Type.String({ description: "Override agent profile thinking level." })),
	tools: Type.Optional(Type.Array(Type.String({ description: "Allowed tool names for the subagent." }))),
	excludeTools: Type.Optional(Type.Array(Type.String({ description: "Tool names to disable for the subagent." }))),
});
type UltragoalSpawnGoalAgentInput = Static<typeof ultragoalSpawnGoalAgentSchema>;

async function executeUltragoalSpawnGoalAgent(
	params: UltragoalSpawnGoalAgentInput,
	ctx: WorkflowContext,
	signal?: AbortSignal,
) {
	const thinkingLevel = parseThinkingLevel(params.thinkingLevel);
	const status = await getUltragoalStatus(ctx.cwd, ctx.sessionManager.getSessionId());
	const goal = status.goals.find((g) => g.id === params.goalId);
	if (!goal) throw new Error(`ultragoal goal not found: ${params.goalId}`);
	const expected = nextRoleForSkill({ skill: "ultragoal", state: status });
	if (!expected) {
		throw new Error("no legal next ultragoal goal to spawn: all goals are completed or none are actionable");
	}
	assertExpectedNextRole(expected, {
		skill: "ultragoal",
		stage: "goal-worker",
		role: params.agent ?? "worker",
		owner: "ultragoal_spawn_goal_agent",
		taskId: goal.id,
	});
	assertNoGuardedSpawnOverrides(params);
	const manager = ctx.subagents;
	if (!manager) throw new Error("No subagent manager is available in this session.");
	const result = await manager.spawn({
		agent: params.agent ?? "worker",
		role: `ultragoal-worker-${goal.id}`,
		model: params.model,
		thinkingLevel,
		prompt: `Main goal: ${status.mainGoal?.title ?? "Ultragoal"}\nTask ${goal.sequence ?? goal.id}: ${goal.title}\nObjective: ${goal.objective}\nAfter work, provide checkpoint evidence. Restore points are state-only; workspace files are not rolled back.`,
		systemPrompt: `You are an ultragoal worker executing checkpointed task "${goal.title}" (id: ${goal.id}) under main goal "${status.mainGoal?.title ?? "Ultragoal"}". Complete only this task and provide checkpoint evidence.`,
		tools: params.tools,
		excludeTools: params.excludeTools,
		persistent: true,
		label: `ultragoal-${goal.id}`,
		parentSessionId: ctx.sessionManager.getSessionId(),
		storageSessionId: ctx.sessionManager.getSessionId(),
		signal,
	});
	return {
		content: [{ type: "text" as const, text: `Spawned subagent ${result.record.id} for goal ${goal.id}` }],
		details: workflowReceipt({ goal, subagent: result.record }),
	};
}

export function registerUltragoalTools(host: WorkflowToolHost): void {
	host.registerTool({
		name: "ultragoal_spawn_goal_agent",
		label: "Ultragoal Spawn Goal Agent",
		description: "Spawn a subagent to achieve an ultragoal goal.",
		promptSnippet: "Spawn agent for ultragoal goal",
		promptGuidelines: [
			"Use ultragoal_spawn_goal_agent to assign an ultragoal goal to an autonomous subagent worker.",
		],
		parameters: ultragoalSpawnGoalAgentSchema,
		execute: async (_toolCallId, params, signal, _onUpdate, ctx) =>
			executeUltragoalSpawnGoalAgent(params, ctx, signal),
	});
}
