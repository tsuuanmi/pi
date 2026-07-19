import type { ExtensionAPI, ExtensionContext } from "@tsuuanmi/pi-agent";
import { type Static, Type } from "typebox";
import { workflowReceipt } from "#workflows/harness/shared/artifacts/artifacts";
import {
	assertExpectedNextRole,
	assertNoGuardedSpawnOverrides,
	expectedNextTeamRole,
} from "#workflows/harness/shared/orchestration/expected-next-role";
import {
	assertAgentThinkingLevel,
	requireSubagentManager,
} from "#workflows/harness/shared/orchestration/workflow-tool-utils";
import { readTeamSnapshot } from "#workflows/skills/team/team-runtime";

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

const teamSpawnReviewAgentSchema = Type.Object({
	teamId: Type.Optional(Type.String({ description: "Team run id. Defaults to the active team." })),
	taskId: Type.String({ description: "Task id to review." }),
	agent: Type.Optional(Type.String({ description: "Agent profile name. Defaults to reviewer." })),
	model: Type.Optional(Type.String({ description: "Override agent profile model as provider/model." })),
	thinkingLevel: Type.Optional(Type.String({ description: "Override agent profile thinking level." })),
	tools: Type.Optional(Type.Array(Type.String({ description: "Allowed tool names for the subagent." }))),
	excludeTools: Type.Optional(Type.Array(Type.String({ description: "Tool names to disable for the subagent." }))),
});
type TeamSpawnReviewAgentInput = Static<typeof teamSpawnReviewAgentSchema>;

const teamSpawnProverAgentSchema = Type.Object({
	teamId: Type.Optional(Type.String({ description: "Team run id. Defaults to the active team." })),
	agent: Type.Optional(Type.String({ description: "Agent profile name. Defaults to prover." })),
	model: Type.Optional(Type.String({ description: "Override agent profile model as provider/model." })),
	thinkingLevel: Type.Optional(Type.String({ description: "Override agent profile thinking level." })),
	tools: Type.Optional(Type.Array(Type.String({ description: "Allowed tool names for the subagent." }))),
	excludeTools: Type.Optional(Type.Array(Type.String({ description: "Tool names to disable for the subagent." }))),
});
type TeamSpawnProverAgentInput = Static<typeof teamSpawnProverAgentSchema>;

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
		systemPrompt: `You are a team worker executing task "${task.title}" (id: ${task.id}). Follow the task description precisely, update the task to in_progress before implementation, and report completion evidence for review.`,
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

async function executeTeamSpawnReviewAgent(
	params: TeamSpawnReviewAgentInput,
	ctx: ExtensionContext,
	signal?: AbortSignal,
) {
	assertAgentThinkingLevel(params.thinkingLevel);
	const snapshot = await readTeamSnapshot(ctx.cwd, ctx.sessionManager.getSessionId(), params.teamId);
	const task = snapshot.tasks.find((t) => t.id === params.taskId);
	if (!task) throw new Error(`team task not found: ${params.taskId}`);
	const expected = expectedNextTeamRole(snapshot);
	if (!expected) throw new Error("no legal next team review to spawn");
	assertExpectedNextRole(expected, {
		skill: "team",
		stage: "task-review",
		role: params.agent ?? "reviewer",
		owner: "team_spawn_review_agent",
		teamId: snapshot.team_id,
		taskId: task.id,
	});
	assertNoGuardedSpawnOverrides(params);
	const result = await requireSubagentManager(ctx).spawn({
		agent: "reviewer",
		role: `team-reviewer-${task.id}`,
		model: undefined,
		thinkingLevel: undefined,
		prompt: `Review team task "${task.title}" (id: ${task.id}). Task description: ${task.description}. Produce a review_report and record it with \`pi workflow team record-review-gate\` for team ${snapshot.team_id} task ${task.id}.`,
		systemPrompt: `You are a team reviewer for task "${task.title}" (id: ${task.id}). Inspect the completed work evidence, changed files, and relevant tests. Do not edit files. Persist a structured review_report through the workflow review gate command.`,
		tools: undefined,
		excludeTools: undefined,
		persistent: true,
		label: `team-${snapshot.team_id}-${task.id}-review`,
		parentSessionId: ctx.sessionManager.getSessionId(),
		storageSessionId: ctx.sessionManager.getSessionId(),
		signal,
	});
	return {
		content: [{ type: "text" as const, text: `Spawned reviewer ${result.record.id} for task ${task.id}` }],
		details: workflowReceipt({ task, subagent: result.record }),
	};
}

async function executeTeamSpawnProverAgent(
	params: TeamSpawnProverAgentInput,
	ctx: ExtensionContext,
	signal?: AbortSignal,
) {
	assertAgentThinkingLevel(params.thinkingLevel);
	const snapshot = await readTeamSnapshot(ctx.cwd, ctx.sessionManager.getSessionId(), params.teamId);
	const expected = expectedNextTeamRole(snapshot);
	if (!expected) throw new Error("no legal next team prover to spawn");
	assertExpectedNextRole(expected, {
		skill: "team",
		stage: "team-proof",
		role: params.agent ?? "prover",
		owner: "team_spawn_prover_agent",
		teamId: snapshot.team_id,
	});
	assertNoGuardedSpawnOverrides(params);
	const result = await requireSubagentManager(ctx).spawn({
		agent: "prover",
		role: `team-prover-${snapshot.team_id}`,
		model: undefined,
		thinkingLevel: undefined,
		prompt: `Verify team ${snapshot.team_id} completion. Produce an evidence_matrix and record it with \`pi workflow team record-completion-gate\` before team completion.`,
		systemPrompt:
			"You are a team prover. Verify all completed team work against concrete evidence, run only safe focused checks, do not edit files, and persist a structured evidence_matrix through the workflow completion gate command.",
		tools: undefined,
		excludeTools: undefined,
		persistent: true,
		label: `team-${snapshot.team_id}-prover`,
		parentSessionId: ctx.sessionManager.getSessionId(),
		storageSessionId: ctx.sessionManager.getSessionId(),
		signal,
	});
	return {
		content: [{ type: "text" as const, text: `Spawned prover ${result.record.id} for team ${snapshot.team_id}` }],
		details: workflowReceipt({ team: snapshot, subagent: result.record }),
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
	pi.registerTool({
		name: "team_spawn_review_agent",
		label: "Team Spawn Review Agent",
		description: "Spawn a reviewer subagent for the next team task review gate.",
		promptSnippet: "Spawn reviewer for team task",
		promptGuidelines: ["Use team_spawn_review_agent when the next team role is reviewer for a task review gate."],
		parameters: teamSpawnReviewAgentSchema,
		execute: async (_toolCallId, params, signal, _onUpdate, ctx) => executeTeamSpawnReviewAgent(params, ctx, signal),
	});
	pi.registerTool({
		name: "team_spawn_prover_agent",
		label: "Team Spawn Prover Agent",
		description: "Spawn a prover subagent for the team completion evidence gate.",
		promptSnippet: "Spawn prover for team completion",
		promptGuidelines: [
			"Use team_spawn_prover_agent when all team tasks are completed and completion evidence is required.",
		],
		parameters: teamSpawnProverAgentSchema,
		execute: async (_toolCallId, params, signal, _onUpdate, ctx) => executeTeamSpawnProverAgent(params, ctx, signal),
	});
}
