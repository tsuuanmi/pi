import { Agent, type SubagentManager } from "@tsuuanmi/pi-agent";
import { type AssistantMessage, AssistantMessageEventStream, type Context, type Model } from "@tsuuanmi/pi-ai";
import type { WorkflowContext } from "#workflows/tools";

export interface TeamAgentSpec {
	id: string;
	profile: string;
	capabilities?: readonly string[];
	tools?: readonly string[];
	excludeTools?: readonly string[];
}

export function createTeamAgents(ctx: WorkflowContext, specs: readonly TeamAgentSpec[]): readonly Agent[] {
	if (specs.length === 0) throw new Error("team agent roster requires at least one agent");
	const manager = ctx.subagents;
	if (!manager) throw new Error("No subagent manager is available in this session.");
	const sessionId = ctx.sessionManager.getSessionId();
	const ids = new Set<string>();
	return Object.freeze(
		specs.map((spec) => {
			const id = requiredString(spec.id, "agent.id");
			const profile = requiredString(spec.profile, `agent[${id}].profile`);
			if (ids.has(id)) throw new Error(`duplicate team agent id: ${id}`);
			ids.add(id);
			return new Agent({
				name: id,
				capabilities: spec.capabilities,
				streamFn: createStream(manager, sessionId, { ...spec, id, profile }),
			});
		}),
	);
}

function createStream(manager: SubagentManager, sessionId: string, spec: TeamAgentSpec) {
	return async (model: Model, context: Context, options?: { signal?: AbortSignal }) => {
		const stream = new AssistantMessageEventStream();
		try {
			const prompt = readPrompt(context);
			const result = await manager.spawn({
				agent: spec.profile,
				role: spec.id,
				prompt,
				systemPrompt: context.systemPrompt,
				model: `${model.api}/${model.id}`,
				tools: spec.tools ? [...spec.tools] : undefined,
				excludeTools: spec.excludeTools ? [...spec.excludeTools] : undefined,
				parentSessionId: sessionId,
				storageSessionId: sessionId,
				signal: options?.signal,
			});
			const message = createMessage(model, result.output);
			stream.push({ type: "start", partial: message });
			if (result.output.length > 0) {
				stream.push({ type: "text_start", contentIndex: 0, partial: message });
				stream.push({ type: "text_delta", contentIndex: 0, delta: result.output, partial: message });
				stream.push({ type: "text_end", contentIndex: 0, content: result.output, partial: message });
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

function readPrompt(context: Context): string {
	const message = [...context.messages].reverse().find((item) => item.role === "user");
	if (!message) throw new Error("team agent prompt is empty");
	if (typeof message.content === "string") {
		if (message.content.trim().length === 0) throw new Error("team agent prompt is empty");
		return message.content;
	}
	const prompt = message.content
		.filter((part) => part.type === "text")
		.map((part) => part.text)
		.join("\n");
	if (prompt.trim().length === 0) throw new Error("team agent prompt is empty");
	return prompt;
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

function requiredString(value: unknown, field: string): string {
	if (typeof value !== "string") throw new Error(`${field} must be a string`);
	if (value.trim().length === 0) throw new Error(`${field} must be non-empty`);
	if (value.trim() !== value) throw new Error(`${field} must not have surrounding whitespace`);
	return value;
}
