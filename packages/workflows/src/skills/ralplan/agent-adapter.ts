import { Agent, type SubagentManager, type SubagentRunResult } from "@tsuuanmi/pi-agent";
import type { Message } from "@tsuuanmi/pi-ai";
import { createSubagentStream } from "#workflows/orchestration/subagent-stream";
import { type RalplanAgentRecord, writeRalplanAgentRecord } from "#workflows/skills/ralplan/agent-record";
import type { RalplanAgentRequest } from "#workflows/skills/ralplan/agent-roles";

export interface RalplanAgentAdapterInput {
	cwd: string;
	sessionId: string;
	manager: Pick<SubagentManager, "spawn" | "resume">;
	request: RalplanAgentRequest;
	onRecord?: (record: RalplanAgentRecord) => void;
}

export function createRalplanAgent(input: RalplanAgentAdapterInput): Agent {
	return new Agent({
		name: input.request.role,
		capabilities: [input.request.role],
		stream: createSubagentStream(({ signal }) => runAgent(input, signal)),
	});
}

async function runAgent(input: RalplanAgentAdapterInput, signal?: AbortSignal): Promise<string> {
	const { request } = input;
	let result: SubagentRunResult;
	if (request.attemptResume === true) {
		if (!request.plannerSubagentId) throw new Error("ralplan planner resume requires a persisted subagent id");
		const resumed = await input.manager.resume(request.plannerSubagentId, request.taskPrompt, {
			storageSessionId: input.sessionId,
			agent: request.profile,
			model: request.model,
			thinkingLevel: request.thinkingLevel,
			systemPrompt: request.systemPrompt,
			tools: request.tools ? [...request.tools] : undefined,
			excludeTools: request.excludeTools ? [...request.excludeTools] : undefined,
			signal,
		});
		if (!resumed.ok) throw new Error(`ralplan planner resume failed: ${resumed.reason}`);
		result = resumed.result;
	} else {
		result = await input.manager.spawn({
			agent: request.profile,
			role: request.role,
			model: request.model,
			thinkingLevel: request.thinkingLevel,
			label: `ralplan ${request.role} ${request.stage}#${request.stageN}`,
			prompt: request.taskPrompt,
			systemPrompt: request.systemPrompt,
			tools: request.tools ? [...request.tools] : undefined,
			excludeTools: request.excludeTools ? [...request.excludeTools] : undefined,
			persistent: true,
			parentSessionId: input.sessionId,
			storageSessionId: input.sessionId,
			signal,
		});
	}

	const record = await writeRalplanAgentRecord(input.cwd, input.sessionId, {
		agent_run_id: request.agentRunId,
		role: request.role,
		run_id: request.runId,
		stage: request.stage,
		stage_n: request.stageN,
		status: result.record.status === "completed" ? "completed" : "failed",
		planner_subagent_id: result.record.id,
		attempted_resume: request.attemptResume,
		output: result.output,
		stderr: result.record.error_text,
		messages: result.messages as Message[],
	});
	input.onRecord?.(record);
	if (record.status !== "completed") {
		throw new Error(record.stderr ?? `ralplan ${request.role} agent failed`);
	}
	if (record.output === undefined) throw new Error(`ralplan ${request.role} agent completed without output`);
	return record.output;
}
