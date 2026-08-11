import { assertExpectedNextRole, expectedNextTeamRole } from "#workflows/policy/expected-next-role";
import { createTeamAgents, type TeamAgentSpec } from "#workflows/skills/team/agent-adapter";
import { executeTeam, failTeamExecution, resumeTeam, type TeamExecutionInput } from "#workflows/skills/team/execution";
import { assertRoleResult } from "#workflows/skills/team/role-contract";
import { createRoleBatch } from "#workflows/skills/team/role-tasks";
import { markWorkerInProgress } from "#workflows/skills/team/role-transitions";
import { readTeamSnapshot } from "#workflows/skills/team/state";
import type { TeamSnapshot } from "#workflows/skills/team/types";
import { defaultWorkflowId } from "#workflows/state/workflow-state";
import type { WorkflowContext } from "#workflows/tool/context";
import { workflowToolDetails } from "#workflows/tool/details";

export interface TeamExecuteInput {
	teamId?: string;
	agents: readonly TeamAgentSpec[];
}

export interface TeamResumeInput extends TeamExecuteInput {
	runId: string;
}

export async function executeRole(params: TeamExecuteInput, ctx: WorkflowContext, signal: AbortSignal | undefined) {
	const runId = defaultWorkflowId("team-run");
	const role = await prepareRole(params.teamId, params.agents, runId, ctx);
	const input = createExecutionInput(role, ctx, signal, runId);
	const snapshot = await executeTeam(input);
	return completeRole(input, snapshot, role.expected.role, role.expected.taskId, "execute", ctx);
}

export async function resumeRole(params: TeamResumeInput, ctx: WorkflowContext, signal: AbortSignal | undefined) {
	const role = await prepareRole(params.teamId, params.agents, params.runId, ctx);
	const input = createExecutionInput(role, ctx, signal, params.runId);
	const snapshot = await resumeTeam(input);
	return completeRole(input, snapshot, role.expected.role, role.expected.taskId, "resume", ctx);
}

async function prepareRole(
	teamId: string | undefined,
	agentSpecs: readonly TeamAgentSpec[],
	runId: string,
	ctx: WorkflowContext,
) {
	const sessionId = ctx.sessionManager.getSessionId();
	const snapshot = await readTeamSnapshot(ctx.cwd, sessionId, teamId);
	const expected = expectedNextTeamRole(snapshot);
	if (!expected) throw new Error("team has no executable next role");
	assertExpectedNextRole(expected, {
		skill: "team",
		stage: expected.stage,
		role: expected.role,
		owner: "team_execute",
		teamId: snapshot.team_id,
		taskId: expected.taskId,
	});
	const batch = createRoleBatch(snapshot, expected, runId);
	return {
		agents: createTeamAgents(ctx, agentSpecs),
		batch,
		expected,
		snapshot,
		sessionId,
	};
}

function createExecutionInput(
	role: Awaited<ReturnType<typeof prepareRole>>,
	ctx: WorkflowContext,
	signal: AbortSignal | undefined,
	runId: string,
): TeamExecutionInput {
	return {
		cwd: ctx.cwd,
		sessionId: role.sessionId,
		runId,
		role: role.expected.role,
		snapshot: role.snapshot,
		tasks: role.batch.tasks,
		persistIds: role.batch.persistIds,
		agents: role.agents,
		routes: role.batch.routes,
		options: { abortSignal: signal },
	};
}

async function completeRole(
	input: TeamExecutionInput,
	snapshot: TeamSnapshot,
	role: string,
	taskId: string | undefined,
	operation: "execute" | "resume",
	ctx: WorkflowContext,
) {
	try {
		let next = await readTeamSnapshot(ctx.cwd, input.sessionId, snapshot.team_id);
		assertRoleResult(next, role, taskId);
		if (role === "worker" && taskId) {
			const teamId = requiredTeamId(next.team_id);
			await markWorkerInProgress(ctx.cwd, input.sessionId, teamId, taskId);
			next = await readTeamSnapshot(ctx.cwd, input.sessionId, teamId);
		}
		return {
			content: [{ type: "text" as const, text: `Team ${next.team_id} role ${role} execution completed.` }],
			details: workflowToolDetails({ team: next, role, operation, taskId }),
		};
	} catch (error) {
		const current = await readTeamSnapshot(ctx.cwd, input.sessionId, snapshot.team_id);
		await failTeamExecution(input, current, errorMessage(error));
		throw error;
	}
}

function requiredTeamId(value: string | undefined): string {
	if (!value) throw new Error("team role execution requires a team id");
	return value;
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
