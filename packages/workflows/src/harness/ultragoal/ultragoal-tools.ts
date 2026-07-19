import type { ExtensionAPI, ExtensionContext } from "@tsuuanmi/pi-agent";
import { type Static, Type } from "typebox";
import { workflowReceipt } from "#workflows/harness/shared/artifacts/receipts";
import {
	assertExpectedNextRole,
	assertNoGuardedSpawnOverrides,
} from "#workflows/harness/shared/orchestration/expected-next-role";
import {
	assertAgentThinkingLevel,
	requireSubagentManager,
} from "#workflows/harness/shared/orchestration/workflow-tool-utils";
import { expectedNextRoleForSkill } from "#workflows/harness/shared/registry/skill-registry";
import { getUltragoalStatus } from "#workflows/harness/ultragoal/ultragoal-runtime";

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
	ctx: ExtensionContext,
	signal?: AbortSignal,
) {
	assertAgentThinkingLevel(params.thinkingLevel);
	const status = await getUltragoalStatus(ctx.cwd, ctx.sessionManager.getSessionId());
	const goal = status.goals.find((g) => g.id === params.goalId);
	if (!goal) throw new Error(`ultragoal goal not found: ${params.goalId}`);
	const expected = expectedNextRoleForSkill({ skill: "ultragoal", state: status });
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
	const result = await requireSubagentManager(ctx).spawn({
		agent: params.agent ?? "worker",
		role: `ultragoal-worker-${goal.id}`,
		model: params.model,
		thinkingLevel: params.thinkingLevel,
		prompt: `Achieve goal "${goal.title}": ${goal.objective}`,
		systemPrompt: `You are an ultragoal worker executing goal "${goal.title}" (id: ${goal.id}). Complete the goal and provide checkpoint evidence.`,
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

export function registerUltragoalTools(pi: ExtensionAPI): void {
	pi.registerTool({
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
