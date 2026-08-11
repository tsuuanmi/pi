import type { ExtensionAPI, ExtensionContext, ExtensionToolSpec } from "@tsuuanmi/pi/extensions";
import type { ToolResult, ToolUpdate } from "@tsuuanmi/pi-agent";
import type { SubagentContext, SubagentDetails } from "#orchestrator/subagents/context";
import { getSubagentManager } from "#orchestrator/subagents/registry";
import { awaitRun, cancel, pause, resume, spawn, status, steer } from "#orchestrator/subagents/tool-execution";
import type {
	SubagentAwaitInput,
	SubagentIdInput,
	SubagentResumeInput,
	SubagentSpawnInput,
	SubagentStatusInput,
	SubagentSteerInput,
} from "#orchestrator/subagents/tool-schemas";
import {
	subagentAwaitSchema,
	subagentIdSchema,
	subagentPauseSchema,
	subagentResumeSchema,
	subagentSpawnSchema,
	subagentStatusSchema,
	subagentSteerSchema,
} from "#orchestrator/subagents/tool-schemas";

export const SUBAGENT_SPECS = [
	{
		name: "subagent_spawn",
		label: "Subagent Spawn",
		description: "Spawn a subagent session with optional restricted tools and persistence.",
		promptSnippet: "Spawn a durable subagent for isolated work",
		promptGuidelines: ["Use subagent_spawn when work should run in an isolated agent context."],
		parameters: subagentSpawnSchema,
		execute: (
			_id: string,
			p: SubagentSpawnInput,
			c: SubagentContext,
			s?: AbortSignal,
			_u?: ToolUpdate<SubagentDetails>,
		) => spawn(p, c, s),
	},
	{
		name: "subagent_status",
		label: "Subagent Status",
		description: "Read one subagent record or list recent subagent records.",
		promptSnippet: "Inspect subagent records",
		promptGuidelines: ["Use subagent_status before resuming or auditing subagent work."],
		parameters: subagentStatusSchema,
		execute: (_id: string, p: SubagentStatusInput, c: SubagentContext) => status(p, c),
	},
	{
		name: "subagent_await",
		label: "Subagent Await",
		description: "Await a live subagent or read its terminal result.",
		promptSnippet: "Await subagent completion",
		promptGuidelines: ["Use subagent_await to collect a detached subagent result before integrating it."],
		parameters: subagentAwaitSchema,
		execute: (_id: string, p: SubagentAwaitInput, c: SubagentContext) => awaitRun(p, c),
	},
	{
		name: "subagent_steer",
		label: "Subagent Steer",
		description: "Inject a steering message into a live subagent or resume it from saved context.",
		promptSnippet: "Steer a live subagent",
		promptGuidelines: ["Use subagent_steer to redirect a running or saved subagent without restarting its context."],
		parameters: subagentSteerSchema,
		execute: (_id: string, p: SubagentSteerInput, c: SubagentContext) => steer(p, c),
	},
	{
		name: "subagent_pause",
		label: "Subagent Pause",
		description: "Pause a running subagent at a safe boundary; its saved context remains resumable.",
		promptSnippet: "Pause a running subagent",
		promptGuidelines: ["Use subagent_pause to suspend a subagent so it can be resumed later from its saved context."],
		parameters: subagentPauseSchema,
		execute: (_id: string, p: SubagentIdInput, c: SubagentContext) => pause(p, c),
	},
	{
		name: "subagent_resume",
		label: "Subagent Resume",
		description: "Resume a saved persistent subagent session with a follow-up message.",
		promptSnippet: "Resume a subagent from saved context",
		promptGuidelines: ["Use subagent_resume when a previous persistent subagent should continue from its context."],
		parameters: subagentResumeSchema,
		execute: (
			_id: string,
			p: SubagentResumeInput,
			c: SubagentContext,
			s?: AbortSignal,
			_u?: ToolUpdate<SubagentDetails>,
		) => resume(p, c, s),
	},
	{
		name: "subagent_cancel",
		label: "Subagent Cancel",
		description: "Cancel a live or durable subagent record.",
		promptSnippet: "Cancel a live subagent",
		promptGuidelines: ["Use subagent_cancel to stop work that should no longer continue."],
		parameters: subagentIdSchema,
		execute: (_id: string, p: SubagentIdInput, c: SubagentContext) => cancel(p, c),
	},
] as const;

function contextOf(context: ExtensionContext): SubagentContext {
	return { manager: getSubagentManager(context), sessionId: context.sessionManager.getSessionId() };
}

export function registerSubagentTools(host: Pick<ExtensionAPI, "registerTool">): void {
	for (const spec of SUBAGENT_SPECS) {
		const tool = {
			...spec,
			execute: (
				id: string,
				params: unknown,
				signal: AbortSignal | undefined,
				onUpdate: ToolUpdate<SubagentDetails> | undefined,
				context: ExtensionContext,
			) =>
				(
					spec.execute as (
						id: string,
						params: unknown,
						context: SubagentContext,
						signal?: AbortSignal,
						onUpdate?: ToolUpdate<SubagentDetails>,
					) => Promise<ToolResult<SubagentDetails>>
				)(id, params, contextOf(context), signal, onUpdate),
		} as unknown as ExtensionToolSpec;
		host.registerTool(tool);
	}
}
