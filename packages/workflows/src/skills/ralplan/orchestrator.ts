import type { SubagentManagerApi } from "@tsuuanmi/pi-orchestrator";
import {
	Orchestrator,
	type RunTeamResult,
	type TaskExecutionReceipt,
	type TaskInput,
	type TaskSnapshot,
	Team,
} from "@tsuuanmi/pi-orchestrator";
import type { RalplanStage } from "#workflows/session/paths";
import { createRalplanAgent } from "#workflows/skills/ralplan/agent-adapter";
import { type RalplanAgentRecord, writeRalplanAgentRecord } from "#workflows/skills/ralplan/agent-record";
import { createRalplanAgentRequest, type RalplanAgentInput } from "#workflows/skills/ralplan/agent-roles";
import { createRalplanCheckpointStore } from "#workflows/skills/ralplan/checkpoint-store";
import { assertRalplanExplorerGatePassed } from "#workflows/skills/ralplan/gates";
import { assertSafePathComponent } from "#workflows/state/state-schema";

export interface RalplanStageInput extends RalplanAgentInput {
	cwd: string;
	sessionId: string;
	manager: Pick<SubagentManagerApi, "spawn" | "resume">;
	verifyArtifact: () => boolean | Promise<boolean>;
	signal?: AbortSignal;
}

export interface RalplanStageResult {
	run: RunTeamResult;
	task: TaskSnapshot;
	receipt: TaskExecutionReceipt;
	agent: RalplanAgentRecord;
}

export async function planRalplanAgent(
	cwd: string,
	sessionId: string,
	input: RalplanAgentInput,
): Promise<RalplanAgentRecord> {
	const request = createRalplanAgentRequest(input);
	if (request.stage === "planner") await assertRalplanExplorerGatePassed(cwd, request.runId, sessionId);
	return writeRalplanAgentRecord(cwd, sessionId, {
		agent_run_id: request.agentRunId,
		role: request.role,
		run_id: request.runId,
		stage: request.stage,
		stage_n: request.stageN,
		status: "planned",
		planner_subagent_id: request.plannerSubagentId,
		attempted_resume: request.attemptResume,
		output: request.taskPrompt,
	});
}

export async function runRalplanStage(input: RalplanStageInput): Promise<RalplanStageResult> {
	const request = createRalplanAgentRequest(input);
	assertSafePathComponent(request.runId, "runId");
	if (request.stage === "planner") {
		await assertRalplanExplorerGatePassed(input.cwd, request.runId, input.sessionId);
	}

	let agentRecord: RalplanAgentRecord | undefined;
	const agent = createRalplanAgent({
		cwd: input.cwd,
		sessionId: input.sessionId,
		manager: input.manager,
		request,
		onRecord: (record) => {
			agentRecord = record;
		},
	});
	const task = createTask(
		request.runId,
		input.sessionId,
		request.stage,
		request.stageN,
		request.role,
		request.taskPrompt,
		request.agentRunId,
	);
	const team = new Team({ name: `ralplan-${request.runId}`, agents: [agent] });
	const taskId = task.id;
	const orchestrator = new Orchestrator({
		maxConcurrency: 1,
		checkpointFailurePolicy: "strict",
		checkpointStore: createRalplanCheckpointStore(
			input.cwd,
			request.runId,
			request.stageN,
			request.stage,
			input.sessionId,
		),
		runIdentity: {
			runId: taskId,
			metadata: {
				workflow: "ralplan",
				sessionId: input.sessionId,
				runId: request.runId,
				stage: request.stage,
				stageN: request.stageN,
			},
		},
		onTaskVerify: async () => {
			if (!agentRecord || agentRecord.status !== "completed") return false;
			return input.verifyArtifact();
		},
	});
	const run = await orchestrator.run(team, [task], { abortSignal: input.signal });
	const completedTask = run.tasks.find((candidate) => candidate.id === taskId);
	const receipt = run.receipts[taskId];
	if (!completedTask) throw new Error(`ralplan orchestrator did not return task ${taskId}`);
	if (!receipt) throw new Error(`ralplan orchestrator did not return receipt for task ${taskId}`);
	if (!run.success || completedTask.status !== "completed") {
		throw new Error(completedTask.error ?? run.abortedReason ?? `ralplan ${request.stage} stage failed`);
	}
	if (!agentRecord) throw new Error(`ralplan agent ${request.agentRunId} did not record a run`);

	return Object.freeze({ run, task: completedTask, receipt, agent: agentRecord });
}

function createTask(
	runId: string,
	sessionId: string,
	stage: RalplanStage,
	stageN: number,
	role: string,
	description: string,
	agentRunId: string,
): TaskInput & { id: string } {
	const id = `ralplan:${sessionId}:${runId}:${stage}:${stageN}`;
	return {
		id,
		title: `Ralplan ${role} ${stage}#${stageN}`,
		description,
		assignee: role,
		role,
		priority: "normal",
		maxRetries: 0,
		verify: { artifact: true },
		metadata: {
			workflow: "ralplan",
			sessionId,
			runId,
			stage,
			stageN,
			agentRunId,
		},
	};
}
