import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import type { AgentMessage, SubagentManager, SubagentRunResult, ThinkingLevel } from "@tsuuanmi/pi-agent";
import type { Message } from "@tsuuanmi/pi-ai";
import { buildRalplanRoleSystemPrompt, buildRalplanTaskPrompt } from "../shared/context-templates.ts";
import type { RalplanStage } from "../shared/paths.ts";
import { workflowStatePath } from "../shared/session-layout.ts";
import { writeJsonAtomic } from "../shared/state-writer.ts";
import { activeRalplanRunId, defaultWorkflowId } from "../shared/workflow-state.ts";
import { assertRalplanExplorerGatePassed } from "./ralplan-gates.ts";

export type RalplanAgentRole = "planner" | "architect" | "critic" | "expert";

export interface RalplanAgentRunInput {
	role: RalplanAgentRole;
	agent?: string;
	model?: string;
	thinkingLevel?: ThinkingLevel;
	tools?: string[];
	excludeTools?: string[];
	task: string;
	stage: RalplanStage;
	stageN: number;
	runId?: string;
	contextArtifacts?: string[];
	deliberate?: boolean;
	plannerSubagentId?: string;
	attemptResume?: boolean;
	dryRun?: boolean;
	subagentManager?: Pick<SubagentManager, "spawn" | "resume">;
}

export interface RalplanAgentRunResult {
	agent_run_id: string;
	role: RalplanAgentRole;
	run_id: string;
	stage: RalplanStage;
	stage_n: number;
	status: "planned" | "completed" | "failed";
	record_path: string;
	planner_subagent_id?: string;
	attempted_resume?: boolean;
	output?: string;
	stderr?: string;
	messages?: Message[];
}

const EXPERT_STRATEGIST_EXCLUDED_TOOLS = [
	"subagent_spawn",
	"subagent_resume",
	"subagent_await",
	"subagent_status",
	"subagent_steer",
	"subagent_pause",
	"subagent_cancel",
] as const;

function subagentMessages(result: SubagentRunResult): Message[] {
	return result.messages as Message[];
}

function excludeToolsForRole(role: RalplanAgentRole, excludeTools: string[] | undefined): string[] | undefined {
	if (role !== "expert") return excludeTools;
	return Array.from(new Set([...(excludeTools ?? []), ...EXPERT_STRATEGIST_EXCLUDED_TOOLS]));
}

async function writeRunRecord(
	cwd: string,
	result: Omit<RalplanAgentRunResult, "record_path">,
	sessionId?: string,
): Promise<RalplanAgentRunResult> {
	const storageSessionId = sessionId?.trim();
	if (!storageSessionId) throw new Error("ralplan role-agent records require a session id");
	const recordPath = join(
		dirname(workflowStatePath(cwd, "ralplan", storageSessionId)),
		"agents",
		`${result.agent_run_id}.json`,
	);
	const withPath = { ...result, record_path: recordPath };
	await writeJsonAtomic(recordPath, withPath, { cwd });
	return withPath;
}

export async function runRalplanAgent(
	cwd: string,
	input: RalplanAgentRunInput,
	sessionId?: string,
	signal?: AbortSignal,
): Promise<RalplanAgentRunResult> {
	const storageSessionId = sessionId?.trim();
	if (!storageSessionId) throw new Error("ralplan role-agent runs require a session id");
	if (!Number.isInteger(input.stageN) || input.stageN < 1 || input.stageN > 999)
		throw new Error(`invalid stageN: ${input.stageN}`);
	const runId =
		input.runId?.trim() || (await activeRalplanRunId(cwd, storageSessionId)) || defaultWorkflowId("ralplan");
	if (input.stage === "planner") await assertRalplanExplorerGatePassed(cwd, runId, storageSessionId);
	const agentRunId = `ralagent-${randomUUID()}`;
	const prompt = buildRalplanRoleSystemPrompt(input.role);
	const excludeTools = excludeToolsForRole(input.role, input.excludeTools);
	const task = buildRalplanTaskPrompt({
		role: input.role,
		runId,
		stage: input.stage,
		stageN: input.stageN,
		deliberate: input.deliberate,
		plannerSubagentId: input.plannerSubagentId,
		attemptResume: input.attemptResume,
		contextArtifacts: input.contextArtifacts,
		task: input.task,
	});
	if (input.dryRun === true) {
		return writeRunRecord(
			cwd,
			{
				agent_run_id: agentRunId,
				role: input.role,
				run_id: runId,
				stage: input.stage,
				stage_n: input.stageN,
				status: "planned",
				planner_subagent_id: input.plannerSubagentId,
				attempted_resume: input.attemptResume,
				output: task,
			},
			storageSessionId,
		);
	}

	if (!input.subagentManager) throw new Error("ralplan role agents require Pi-native subagents");
	let subagentResult: SubagentRunResult;
	if (input.attemptResume === true && input.plannerSubagentId) {
		const resume = await input.subagentManager.resume(input.plannerSubagentId, task, {
			storageSessionId,
			agent: input.agent ?? input.role,
			model: input.model,
			thinkingLevel: input.thinkingLevel,
			systemPrompt: prompt,
			tools: input.tools,
			excludeTools,
			signal,
		});
		if (!resume.ok) throw new Error(`ralplan planner resume failed: ${resume.reason}`);
		subagentResult = resume.result;
	} else {
		subagentResult = await input.subagentManager.spawn({
			agent: input.agent ?? input.role,
			role: input.role,
			model: input.model,
			thinkingLevel: input.thinkingLevel,
			label: `ralplan ${input.role} ${input.stage}#${input.stageN}`,
			prompt: task,
			systemPrompt: prompt,
			cwd,
			tools: input.tools,
			excludeTools,
			persistent: true,
			parentSessionId: storageSessionId,
			storageSessionId,
			signal,
		});
	}
	return writeRunRecord(
		cwd,
		{
			agent_run_id: agentRunId,
			role: input.role,
			run_id: runId,
			stage: input.stage,
			stage_n: input.stageN,
			status: subagentResult.record.status === "completed" ? "completed" : "failed",
			planner_subagent_id: subagentResult.record.id,
			attempted_resume: input.attemptResume,
			output: subagentResult.output,
			stderr: subagentResult.record.error_text,
			messages: subagentMessages(subagentResult),
		},
		storageSessionId,
	);
}

export function ralplanRoleForStage(stage: RalplanStage): RalplanAgentRole {
	if (stage === "planner" || stage === "revision") return "planner";
	if (stage === "architect") return "architect";
	if (stage === "critic") return "critic";
	if (stage === "expert-stage") return "expert";
	throw new Error(`no ralplan role agent for stage: ${stage}`);
}

export type { AgentMessage };
