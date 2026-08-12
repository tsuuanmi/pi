import { Agent } from "@tsuuanmi/pi-agent";
import type { Context } from "@tsuuanmi/pi-ai";
import type { SubagentManagerApi } from "@tsuuanmi/pi-orchestrator";
import { createSubagentStream } from "@tsuuanmi/pi-orchestrator";
import type { WorkflowContext } from "#workflows/tool/context";

export interface TeamAgentSpec {
	id: string;
	profile: string;
	capabilities?: readonly string[];
	tools?: readonly string[];
	excludeTools?: readonly string[];
}

export function createTeamAgents(ctx: WorkflowContext, specs: readonly TeamAgentSpec[]): readonly Agent[] {
	if (specs.length === 0) throw new Error("team agent roster requires at least one agent");
	const manager = ctx.subagent;
	const sessionId = ctx.sessionManager.getSessionId();
	const model = ctx.model;
	if (!model) throw new Error("team execution requires an active host model");
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
				initialState: { model },
				stream: createTeamStream(manager, sessionId, { ...spec, id, profile }),
			});
		}),
	);
}

function createTeamStream(manager: SubagentManagerApi, sessionId: string, spec: TeamAgentSpec) {
	return createSubagentStream(async ({ model, context, signal }) => {
		const result = await manager.spawn({
			agent: spec.profile,
			role: spec.id,
			prompt: readPrompt(context),
			systemPrompt: context.systemPrompt,
			model: `${model.provider}/${model.id}`,
			tools: spec.tools ? [...spec.tools] : undefined,
			excludeTools: spec.excludeTools ? [...spec.excludeTools] : undefined,
			parentSessionId: sessionId,
			storageSessionId: sessionId,
			signal,
		});
		return result.output;
	});
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

function requiredString(value: unknown, field: string): string {
	if (typeof value !== "string") throw new Error(`${field} must be a string`);
	if (value.trim().length === 0) throw new Error(`${field} must be non-empty`);
	if (value.trim() !== value) throw new Error(`${field} must not have surrounding whitespace`);
	return value;
}
