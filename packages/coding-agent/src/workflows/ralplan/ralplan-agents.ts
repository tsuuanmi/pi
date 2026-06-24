import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import type { AgentMessage, ThinkingLevel } from "@tsuuanmi/pi-agent-core";
import type { Message } from "@tsuuanmi/pi-ai";
import type { SubagentManager, SubagentRunResult } from "../../core/subagents.ts";
import type { RalplanStage } from "../shared/paths.ts";
import { workflowStatePath } from "../shared/session-layout.ts";
import { writeJsonAtomic } from "../shared/state-writer.ts";
import { activeRalplanRunId, defaultWorkflowId } from "../shared/workflow-state.ts";

export type RalplanAgentRole = "planner" | "architect" | "critic";

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

function rolePrompt(role: RalplanAgentRole): string {
	const base = [
		"Ralplan workflow contract:",
		"- Produce planning/review artifacts only. Do not edit product files or execute implementation.",
		"- Persist the artifact by calling ralplan_write_artifact with the provided runId, stage, stageN, and full markdown artifact.",
		"- Return only the receipt/path plus compact status. Do not paste the full artifact after persistence.",
	];
	if (role === "planner") {
		return [
			...base,
			"- Planner artifacts must include problem statement, principles, decision drivers, viable options, recommendation, risks, verification plan, and open questions.",
		].join("\n");
	}
	if (role === "architect") {
		return [
			...base,
			"- Architect reviews must provide strongest steelman objection, tradeoff tensions, integration/ownership concerns, and synthesis or requested changes.",
			"- Compact verdict must include CLEAR, WATCH, or BLOCK; and APPROVE, COMMENT, or REQUEST CHANGES.",
		].join("\n");
	}
	return [
		...base,
		"- Critic reviews must evaluate acceptance criteria quality, risk mitigation clarity, testability, fair alternatives, and concrete verification steps.",
		"- Compact verdict must be APPROVE, ITERATE, or REJECT.",
	].join("\n");
}

function buildTask(input: RalplanAgentRunInput, runId: string): string {
	return [
		`Ralplan role: ${input.role}`,
		`Run id: ${runId}`,
		`Persist stage: ${input.stage}`,
		`Persist stageN: ${input.stageN}`,
		`Deliberate mode: ${input.deliberate === true}`,
		input.plannerSubagentId ? `Persisted Planner id: ${input.plannerSubagentId}` : "Persisted Planner id: none",
		input.attemptResume ? "Planner resume requested: true" : "Planner resume requested: false",
		input.contextArtifacts && input.contextArtifacts.length > 0
			? `Context artifacts:\n${input.contextArtifacts.map((item) => `- ${item}`).join("\n")}`
			: "Context artifacts: none",
		"",
		"Task:",
		input.task,
	].join("\n");
}

function subagentMessages(result: SubagentRunResult): Message[] {
	return result.messages as Message[];
}

async function writeRunRecord(
	cwd: string,
	result: Omit<RalplanAgentRunResult, "record_path">,
	sessionId?: string,
): Promise<RalplanAgentRunResult> {
	const recordPath = join(
		dirname(workflowStatePath(cwd, "ralplan", sessionId)),
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
	if (!Number.isInteger(input.stageN) || input.stageN < 1 || input.stageN > 999)
		throw new Error(`invalid stageN: ${input.stageN}`);
	const runId = input.runId?.trim() || (await activeRalplanRunId(cwd, sessionId)) || defaultWorkflowId("ralplan");
	const agentRunId = `ralagent-${randomUUID()}`;
	const prompt = rolePrompt(input.role);
	const task = buildTask(input, runId);
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
			sessionId,
		);
	}

	if (!input.subagentManager) throw new Error("ralplan role agents require Pi-native subagents");
	let subagentResult: SubagentRunResult;
	if (input.attemptResume === true && input.plannerSubagentId) {
		const resume = await input.subagentManager.resume(input.plannerSubagentId, task, {
			agent: input.agent ?? input.role,
			model: input.model,
			thinkingLevel: input.thinkingLevel,
			systemPrompt: prompt,
			tools: input.tools,
			excludeTools: input.excludeTools,
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
			excludeTools: input.excludeTools,
			persistent: true,
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
		sessionId,
	);
}

export function ralplanRoleForStage(stage: RalplanStage): RalplanAgentRole {
	if (stage === "planner" || stage === "revision") return "planner";
	if (stage === "architect") return "architect";
	if (stage === "critic") return "critic";
	throw new Error(`no ralplan role agent for stage: ${stage}`);
}

export type { AgentMessage };
