import type { TSchema } from "typebox";
import type { SubagentContext, SubagentDetails } from "#agent/subagents/context";
import type { SubagentSpec } from "#agent/subagents/spec";
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
import { Tool } from "#agent/tool/tool";

const subagentSpawnSpec = {
	name: "subagent_spawn",
	label: "Subagent Spawn",
	description: "Spawn a subagent session with optional restricted tools and persistence.",
	promptSnippet: "Spawn a durable subagent for isolated work",
	promptGuidelines: ["Use subagent_spawn when work should run in an isolated agent context."],
	parameters: subagentSpawnSchema,
	execute: (_toolCallId, params: SubagentSpawnInput, context, signal) => spawn(params, context, signal),
} satisfies SubagentSpec<typeof subagentSpawnSchema>;

const subagentStatusSpec = {
	name: "subagent_status",
	label: "Subagent Status",
	description: "Read one subagent record or list recent subagent records.",
	promptSnippet: "Inspect subagent records",
	promptGuidelines: ["Use subagent_status before resuming or auditing subagent work."],
	parameters: subagentStatusSchema,
	execute: (_toolCallId, params: SubagentStatusInput, context) => status(params, context),
} satisfies SubagentSpec<typeof subagentStatusSchema>;

const subagentAwaitSpec = {
	name: "subagent_await",
	label: "Subagent Await",
	description: "Await a live subagent or read its terminal result.",
	promptSnippet: "Await subagent completion",
	promptGuidelines: ["Use subagent_await to collect a detached subagent result before integrating it."],
	parameters: subagentAwaitSchema,
	execute: (_toolCallId, params: SubagentAwaitInput, context) => awaitRun(params, context),
} satisfies SubagentSpec<typeof subagentAwaitSchema>;

const subagentSteerSpec = {
	name: "subagent_steer",
	label: "Subagent Steer",
	description: "Inject a steering message into a live subagent or resume it from saved context.",
	promptSnippet: "Steer a live subagent",
	promptGuidelines: ["Use subagent_steer to redirect a running or saved subagent without restarting its context."],
	parameters: subagentSteerSchema,
	execute: (_toolCallId, params: SubagentSteerInput, context) => steer(params, context),
} satisfies SubagentSpec<typeof subagentSteerSchema>;

const subagentPauseSpec = {
	name: "subagent_pause",
	label: "Subagent Pause",
	description: "Pause a running subagent at a safe boundary; its saved context remains resumable.",
	promptSnippet: "Pause a running subagent",
	promptGuidelines: ["Use subagent_pause to suspend a subagent so it can be resumed later from its saved context."],
	parameters: subagentPauseSchema,
	execute: (_toolCallId, params: SubagentIdInput, context) => pause(params, context),
} satisfies SubagentSpec<typeof subagentPauseSchema>;

const subagentResumeSpec = {
	name: "subagent_resume",
	label: "Subagent Resume",
	description: "Resume a saved persistent subagent session with a follow-up message.",
	promptSnippet: "Resume a subagent from saved context",
	promptGuidelines: ["Use subagent_resume when a previous persistent subagent should continue from its context."],
	parameters: subagentResumeSchema,
	execute: (_toolCallId, params: SubagentResumeInput, context, signal) => resume(params, context, signal),
} satisfies SubagentSpec<typeof subagentResumeSchema>;

const subagentCancelSpec = {
	name: "subagent_cancel",
	label: "Subagent Cancel",
	description: "Cancel a live or durable subagent record.",
	promptSnippet: "Cancel a live subagent",
	promptGuidelines: ["Use subagent_cancel to stop work that should no longer continue."],
	parameters: subagentIdSchema,
	execute: (_toolCallId, params: SubagentIdInput, context) => cancel(params, context),
} satisfies SubagentSpec<typeof subagentIdSchema>;

export const SUBAGENT_SPECS = [
	subagentSpawnSpec,
	subagentStatusSpec,
	subagentAwaitSpec,
	subagentSteerSpec,
	subagentPauseSpec,
	subagentResumeSpec,
	subagentCancelSpec,
] as const;

export const SUBAGENT_TOOL_NAMES = SUBAGENT_SPECS.map((spec) => spec.name);

export function createSubagentTools(context: SubagentContext): Tool[] {
	return [
		bindSubagentTool(subagentSpawnSpec, context),
		bindSubagentTool(subagentStatusSpec, context),
		bindSubagentTool(subagentAwaitSpec, context),
		bindSubagentTool(subagentSteerSpec, context),
		bindSubagentTool(subagentPauseSpec, context),
		bindSubagentTool(subagentResumeSpec, context),
		bindSubagentTool(subagentCancelSpec, context),
	];
}

function bindSubagentTool<TParameters extends TSchema, TDetails extends SubagentDetails>(
	spec: SubagentSpec<TParameters, TDetails>,
	context: SubagentContext,
): Tool<TParameters, TDetails> {
	return Tool.define({
		...spec,
		execute: (toolCallId, params, signal, onUpdate) => spec.execute(toolCallId, params, context, signal, onUpdate),
	});
}
