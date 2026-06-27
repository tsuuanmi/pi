import { type Static, Type } from "typebox";
import type { ExtensionAPI, ExtensionContext } from "../../api/types.ts";
import { maybeRedirectVagueExecution } from "../ralplan/vagueness-gate.ts";
import { workflowReceipt } from "../shared/receipts.ts";
import { assertSafePathComponent } from "../shared/state-schema.ts";
import { syncWorkflowHudUi } from "../shared/workflow-state-tool.ts";
import { assertAgentThinkingLevel, requireSubagentManager } from "../shared/workflow-tool-utils.ts";
import {
	completeTeam,
	createTeamTask,
	readTeamCompact,
	readTeamSnapshot,
	sendTeamMessage,
	startTeam,
	transitionTeamTask,
} from "./team-runtime.ts";

const teamStartSchema = Type.Object({
	task: Type.String(),
	teamId: Type.Optional(Type.String()),
});
type TeamStartInput = Static<typeof teamStartSchema>;

const teamRunSchema = Type.Object({
	teamId: Type.Optional(Type.String()),
});
type TeamRunInput = Static<typeof teamRunSchema>;

const teamCreateTaskSchema = Type.Object({
	teamId: Type.Optional(Type.String()),
	id: Type.Optional(Type.String()),
	title: Type.String(),
	description: Type.String(),
	owner: Type.Optional(Type.String()),
	dependsOn: Type.Optional(Type.Array(Type.String())),
});
type TeamCreateTaskInput = Static<typeof teamCreateTaskSchema>;

const teamTransitionTaskSchema = Type.Object({
	teamId: Type.Optional(Type.String()),
	taskId: Type.String(),
	status: Type.String(),
	workerId: Type.Optional(Type.String()),
	evidence: Type.Optional(
		Type.Object({
			summary: Type.String(),
			files: Type.Optional(Type.Array(Type.String())),
			verification: Type.Optional(Type.Array(Type.String())),
			recorded_by: Type.String(),
		}),
	),
});
type TeamTransitionTaskInput = Static<typeof teamTransitionTaskSchema>;

const teamMessageSchema = Type.Object({
	teamId: Type.Optional(Type.String()),
	from: Type.String(),
	to: Type.String(),
	body: Type.String(),
	idempotencyKey: Type.Optional(Type.String()),
});
type TeamMessageInput = Static<typeof teamMessageSchema>;

const teamCompleteSchema = Type.Object({
	teamId: Type.Optional(Type.String()),
	phase: Type.Optional(Type.String({ description: "complete, failed, or cancelled. Defaults to complete." })),
	summary: Type.Optional(Type.String()),
});
type TeamCompleteInput = Static<typeof teamCompleteSchema>;

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

async function executeTeamStart(params: TeamStartInput, ctx: ExtensionContext) {
	const vagueness = maybeRedirectVagueExecution("team", params.task);
	if (vagueness.redirect) {
		throw new Error(vagueness.message);
	}
	if (params.teamId) assertSafePathComponent(params.teamId, "teamId");
	const result = await startTeam(
		ctx.cwd,
		{ task: params.task, teamId: params.teamId },
		ctx.sessionManager.getSessionId(),
	);
	await syncWorkflowHudUi(ctx);
	return {
		content: [{ type: "text" as const, text: `Started team ${result.team_id}` }],
		details: workflowReceipt({ ...result }),
	};
}

async function executeTeamSnapshot(params: TeamRunInput, ctx: ExtensionContext) {
	if (params.teamId) assertSafePathComponent(params.teamId, "teamId");
	const result = await readTeamSnapshot(ctx.cwd, ctx.sessionManager.getSessionId(), params.teamId);
	return {
		content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
		details: workflowReceipt({ ...result }),
	};
}

async function executeTeamReadCompact(params: TeamRunInput, ctx: ExtensionContext) {
	if (params.teamId) assertSafePathComponent(params.teamId, "teamId");
	const result = await readTeamCompact(ctx.cwd, ctx.sessionManager.getSessionId(), params.teamId);
	return {
		content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
		details: workflowReceipt({ ...result }),
	};
}

async function executeTeamCreateTask(params: TeamCreateTaskInput, ctx: ExtensionContext) {
	if (params.teamId) assertSafePathComponent(params.teamId, "teamId");
	if (params.id) assertSafePathComponent(params.id, "taskId");
	const result = await createTeamTask(ctx.cwd, params, ctx.sessionManager.getSessionId());
	await syncWorkflowHudUi(ctx);
	return {
		content: [{ type: "text" as const, text: `Created team task ${result.id}` }],
		details: workflowReceipt({ ...result }),
	};
}

async function executeTeamTransitionTask(params: TeamTransitionTaskInput, ctx: ExtensionContext) {
	if (params.teamId) assertSafePathComponent(params.teamId, "teamId");
	assertSafePathComponent(params.taskId, "taskId");
	if (params.workerId) assertSafePathComponent(params.workerId, "workerId");
	const result = await transitionTeamTask(ctx.cwd, params, ctx.sessionManager.getSessionId());
	await syncWorkflowHudUi(ctx);
	return {
		content: [{ type: "text" as const, text: `Updated team task ${result.id} to ${result.status}` }],
		details: workflowReceipt({ ...result }),
	};
}

async function executeTeamMessage(params: TeamMessageInput, ctx: ExtensionContext) {
	if (params.teamId) assertSafePathComponent(params.teamId, "teamId");
	assertSafePathComponent(params.from, "from");
	assertSafePathComponent(params.to, "to");
	const result = await sendTeamMessage(ctx.cwd, params, ctx.sessionManager.getSessionId());
	return {
		content: [{ type: "text" as const, text: `Sent team message ${result.message_id}` }],
		details: workflowReceipt(result),
	};
}

async function executeTeamComplete(params: TeamCompleteInput, ctx: ExtensionContext) {
	if (params.teamId) assertSafePathComponent(params.teamId, "teamId");
	if (
		params.phase !== undefined &&
		params.phase !== "complete" &&
		params.phase !== "failed" &&
		params.phase !== "cancelled"
	) {
		throw new Error(`invalid team completion phase: ${params.phase}`);
	}
	const result = await completeTeam(
		ctx.cwd,
		{
			teamId: params.teamId,
			phase: params.phase,
			summary: params.summary,
		},
		ctx.sessionManager.getSessionId(),
	);
	await syncWorkflowHudUi(ctx);
	return {
		content: [{ type: "text" as const, text: `Closed team ${result.team_id} as ${result.phase}` }],
		details: workflowReceipt({ ...result }),
	};
}

async function executeTeamSpawnTaskAgent(params: TeamSpawnTaskAgentInput, ctx: ExtensionContext, signal?: AbortSignal) {
	assertAgentThinkingLevel(params.thinkingLevel);
	const snapshot = await readTeamSnapshot(ctx.cwd, ctx.sessionManager.getSessionId(), params.teamId);
	const task = snapshot.tasks.find((t) => t.id === params.taskId);
	if (!task) throw new Error(`team task not found: ${params.taskId}`);
	const result = await requireSubagentManager(ctx).spawn({
		agent: params.agent ?? "worker",
		role: `team-worker-${task.id}`,
		model: params.model,
		thinkingLevel: params.thinkingLevel,
		prompt: `Execute team task "${task.title}": ${task.description}${task.owner ? ` (owner: ${task.owner})` : ""}`,
		systemPrompt: `You are a team worker executing task "${task.title}" (id: ${task.id}). Follow the task description precisely and report completion with evidence.`,
		tools: params.tools,
		excludeTools: params.excludeTools,
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
		name: "team_start",
		label: "Team Start",
		description: "Create Pi-native team coordination state under .pi/team/<team-id>.",
		promptSnippet: "Start a runtime-owned team coordination board",
		promptGuidelines: ["Use team_start only after execution is approved and parallel workstreams are useful."],
		parameters: teamStartSchema,
		execute: async (_toolCallId, params, _signal, _onUpdate, ctx) => executeTeamStart(params, ctx),
	});

	pi.registerTool({
		name: "team_snapshot",
		label: "Team Snapshot",
		description: "Read team workers, tasks, counts, and phase.",
		promptSnippet: "Read full team coordination snapshot",
		promptGuidelines: ["Use team_snapshot when auditing or integrating team work."],
		parameters: teamRunSchema,
		execute: async (_toolCallId, params, _signal, _onUpdate, ctx) => executeTeamSnapshot(params, ctx),
	});

	pi.registerTool({
		name: "team_read_compact",
		label: "Team Compact State",
		description: "Read compact team state for continuation.",
		promptSnippet: "Read compact team task/worker status",
		promptGuidelines: ["Use team_read_compact for prompt-efficient team continuation."],
		parameters: teamRunSchema,
		execute: async (_toolCallId, params, _signal, _onUpdate, ctx) => executeTeamReadCompact(params, ctx),
	});

	pi.registerTool({
		name: "team_create_task",
		label: "Team Task Create",
		description: "Create a durable team task.",
		promptSnippet: "Create team task with objective and ownership",
		promptGuidelines: ["Use team_create_task for each independent workstream before executing it."],
		parameters: teamCreateTaskSchema,
		execute: async (_toolCallId, params, _signal, _onUpdate, ctx) => executeTeamCreateTask(params, ctx),
	});

	pi.registerTool({
		name: "team_transition_task",
		label: "Team Task Transition",
		description: "Transition a team task with required completion evidence for completed tasks.",
		promptSnippet: "Update team task state and completion evidence",
		promptGuidelines: ["Use team_transition_task when starting, blocking, completing, or failing team tasks."],
		parameters: teamTransitionTaskSchema,
		execute: async (_toolCallId, params, _signal, _onUpdate, ctx) => executeTeamTransitionTask(params, ctx),
	});

	pi.registerTool({
		name: "team_send_message",
		label: "Team Message",
		description: "Append a durable mailbox message for a team participant.",
		promptSnippet: "Send team coordination mailbox message",
		promptGuidelines: ["Use team_send_message to record cross-workstream coordination decisions."],
		parameters: teamMessageSchema,
		execute: async (_toolCallId, params, _signal, _onUpdate, ctx) => executeTeamMessage(params, ctx),
	});

	pi.registerTool({
		name: "team_complete",
		label: "Team Complete",
		description: "Close a team run as complete, failed, or cancelled.",
		promptSnippet: "Close team coordination runtime state",
		promptGuidelines: [
			"Use team_complete after integration and verification are complete, or to record failure/cancellation.",
		],
		parameters: teamCompleteSchema,
		execute: async (_toolCallId, params, _signal, _onUpdate, ctx) => executeTeamComplete(params, ctx),
	});

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
