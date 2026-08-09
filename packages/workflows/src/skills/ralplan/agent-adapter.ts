import { Agent, type SubagentManager, type SubagentRunResult } from "@tsuuanmi/pi-agent";
import {
	type AssistantMessage,
	AssistantMessageEventStream,
	type Context,
	type Message,
	type Model,
} from "@tsuuanmi/pi-ai";
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
		stream: createStream(input),
	});
}

function createStream(input: RalplanAgentAdapterInput) {
	return async (model: Model, _context: Context, options?: { signal?: AbortSignal }) => {
		const stream = new AssistantMessageEventStream();
		try {
			const record = await runAgent(input, options?.signal);
			const message = createMessage(model, record.output ?? "");
			stream.push({ type: "start", partial: message });
			if (record.output) {
				stream.push({ type: "text_start", contentIndex: 0, partial: message });
				stream.push({ type: "text_delta", contentIndex: 0, delta: record.output, partial: message });
				stream.push({ type: "text_end", contentIndex: 0, content: record.output, partial: message });
			}
			stream.push({ type: "done", reason: "stop", message });
		} catch (error) {
			const aborted = options?.signal?.aborted === true;
			const message = createErrorMessage(model, error, aborted);
			stream.push({ type: "start", partial: message });
			stream.push({ type: "error", reason: aborted ? "aborted" : "error", error: message });
		}
		return stream;
	};
}

async function runAgent(input: RalplanAgentAdapterInput, signal?: AbortSignal): Promise<RalplanAgentRecord> {
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
	return record;
}

function createMessage(model: Model, output: string): AssistantMessage {
	return {
		role: "assistant",
		content: [{ type: "text", text: output }],
		api: model.api,
		provider: model.provider,
		model: model.id,
		usage: zeroUsage(),
		stopReason: "stop",
		timestamp: Date.now(),
	};
}

function createErrorMessage(model: Model, error: unknown, aborted: boolean): AssistantMessage {
	return {
		...createMessage(model, ""),
		stopReason: aborted ? "aborted" : "error",
		errorMessage: error instanceof Error ? error.message : String(error),
	};
}

function zeroUsage() {
	return {
		input: 0,
		output: 0,
		cacheRead: 0,
		cacheWrite: 0,
		totalTokens: 0,
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
	};
}
