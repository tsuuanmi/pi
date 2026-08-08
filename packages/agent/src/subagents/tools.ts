import { awaitRun, cancel, pause, resume, spawn, status, steer } from "#agent/subagents/tool-execution";
import type {
	SubagentAwaitInput,
	SubagentIdInput,
	SubagentResumeInput,
	SubagentSpawnInput,
	SubagentStatusInput,
	SubagentSteerInput,
} from "#agent/subagents/tool-schemas";
import {
	subagentAwaitSchema,
	subagentIdSchema,
	subagentPauseSchema,
	subagentResumeSchema,
	subagentSpawnSchema,
	subagentStatusSchema,
	subagentSteerSchema,
} from "#agent/subagents/tool-schemas";
import type { SubagentTool } from "#agent/subagents/tool-types";

export const subagentSpawnTool: SubagentTool<typeof subagentSpawnSchema> = {
	name: "subagent_spawn",
	label: "Subagent Spawn",
	description: "Spawn a Pi-native subagent session with optional restricted tools and persistence.",
	promptSnippet: "Spawn a durable Pi subagent for isolated work",
	promptGuidelines: [
		"Use subagent_spawn when work should run in an isolated agent context. Its records and persistent session logs are stored under the current Pi session id.",
	],
	parameters: subagentSpawnSchema,
	execute: (_toolCallId, params: SubagentSpawnInput, context, signal) => spawn(params, context, signal),
};

export const subagentStatusTool: SubagentTool<typeof subagentStatusSchema> = {
	name: "subagent_status",
	label: "Subagent Status",
	description: "Read one subagent record or list recent subagent records.",
	promptSnippet: "Inspect Pi-native subagent records",
	promptGuidelines: ["Use subagent_status before resuming or auditing subagent work."],
	parameters: subagentStatusSchema,
	execute: (_toolCallId, params: SubagentStatusInput, context) => status(params, context),
};

export const subagentAwaitTool: SubagentTool<typeof subagentAwaitSchema> = {
	name: "subagent_await",
	label: "Subagent Await",
	description: "Await a live subagent or read its terminal result.",
	promptSnippet: "Await Pi-native subagent completion",
	promptGuidelines: ["Use subagent_await to collect a detached subagent result before integrating it."],
	parameters: subagentAwaitSchema,
	execute: (_toolCallId, params: SubagentAwaitInput, context) => awaitRun(params, context),
};

export const subagentSteerTool: SubagentTool<typeof subagentSteerSchema> = {
	name: "subagent_steer",
	label: "Subagent Steer",
	description: "Inject a steering message into a live subagent or resume it from saved context.",
	promptSnippet: "Steer a live Pi-native subagent",
	promptGuidelines: ["Use subagent_steer to redirect a running or saved subagent without restarting its context."],
	parameters: subagentSteerSchema,
	execute: (_toolCallId, params: SubagentSteerInput, context) => steer(params, context),
};

export const subagentPauseTool: SubagentTool<typeof subagentPauseSchema> = {
	name: "subagent_pause",
	label: "Subagent Pause",
	description: "Pause a running subagent at a safe boundary; its saved context remains resumable.",
	promptSnippet: "Pause a running Pi-native subagent",
	promptGuidelines: ["Use subagent_pause to suspend a subagent so it can be resumed later from its saved context."],
	parameters: subagentPauseSchema,
	execute: (_toolCallId, params: SubagentIdInput, context) => pause(params, context),
};

export const subagentResumeTool: SubagentTool<typeof subagentResumeSchema> = {
	name: "subagent_resume",
	label: "Subagent Resume",
	description: "Resume a saved persistent subagent session with a follow-up message.",
	promptSnippet: "Resume a Pi-native subagent from saved context",
	promptGuidelines: ["Use subagent_resume when a previous persistent subagent should continue from its context."],
	parameters: subagentResumeSchema,
	execute: (_toolCallId, params: SubagentResumeInput, context, signal) => resume(params, context, signal),
};

export const subagentCancelTool: SubagentTool<typeof subagentIdSchema> = {
	name: "subagent_cancel",
	label: "Subagent Cancel",
	description: "Cancel a live or durable subagent record.",
	promptSnippet: "Cancel a live Pi-native subagent",
	promptGuidelines: ["Use subagent_cancel to stop work that should no longer continue."],
	parameters: subagentIdSchema,
	execute: (_toolCallId, params: SubagentIdInput, context) => cancel(params, context),
};

export const SUBAGENT_TOOLS = [
	subagentSpawnTool,
	subagentStatusTool,
	subagentAwaitTool,
	subagentSteerTool,
	subagentPauseTool,
	subagentResumeTool,
	subagentCancelTool,
] as const;

export type { SubagentDetails, SubagentTool, SubagentToolContext } from "#agent/subagents/tool-types";
