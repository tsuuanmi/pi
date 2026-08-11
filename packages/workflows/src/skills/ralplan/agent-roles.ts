import { randomUUID } from "node:crypto";
import type { ThinkingLevel } from "@tsuuanmi/pi-agent";
import { buildRalplanRoleSystemPrompt, buildRalplanTaskPrompt } from "#workflows/policy/context-templates";
import type { RalplanStage } from "#workflows/session/paths";

export type RalplanAgentRole = "explorer" | "planner" | "architect" | "critic" | "expert";

export interface RalplanAgentInput {
	role: RalplanAgentRole;
	model?: string;
	thinkingLevel?: ThinkingLevel;
	tools?: readonly string[];
	excludeTools?: readonly string[];
	task: string;
	stage: RalplanStage;
	stageN: number;
	runId: string;
	contextArtifacts?: readonly string[];
	deliberate?: boolean;
	plannerSubagentId?: string;
	attemptResume?: boolean;
}

export interface RalplanAgentRequest {
	agentRunId: string;
	role: RalplanAgentRole;
	profile: string;
	model?: string;
	thinkingLevel?: ThinkingLevel;
	tools?: readonly string[];
	excludeTools?: readonly string[];
	stage: RalplanStage;
	stageN: number;
	runId: string;
	taskPrompt: string;
	systemPrompt: string;
	plannerSubagentId?: string;
	attemptResume?: boolean;
}

const EXPERT_EXCLUDED_TOOLS = [
	"subagent_spawn",
	"subagent_resume",
	"subagent_await",
	"subagent_status",
	"subagent_steer",
	"subagent_pause",
	"subagent_cancel",
] as const;

export function createRalplanAgentRequest(input: RalplanAgentInput): RalplanAgentRequest {
	const runId = requiredString(input.runId, "runId");
	const task = requiredString(input.task, "task");
	if (!Number.isInteger(input.stageN) || input.stageN < 1 || input.stageN > 999) {
		throw new Error(`invalid stageN: ${input.stageN}`);
	}
	const expectedRole = roleForStage(input.stage);
	if (input.role !== expectedRole) {
		throw new Error(`ralplan ${input.stage} stage requires the ${expectedRole} role`);
	}

	const profile = input.role;
	const excludeTools = input.role === "expert" ? mergeExpertTools(input.excludeTools) : copyTools(input.excludeTools);
	return Object.freeze({
		agentRunId: `ralagent-${randomUUID()}`,
		role: input.role,
		profile,
		model: input.model,
		thinkingLevel: input.thinkingLevel,
		tools: copyTools(input.tools),
		excludeTools,
		stage: input.stage,
		stageN: input.stageN,
		runId,
		taskPrompt: buildRalplanTaskPrompt({
			role: input.role,
			runId,
			stage: input.stage,
			stageN: input.stageN,
			deliberate: input.deliberate,
			plannerSubagentId: input.plannerSubagentId,
			attemptResume: input.attemptResume,
			contextArtifacts: input.contextArtifacts ? [...input.contextArtifacts] : undefined,
			task,
		}),
		systemPrompt: buildRalplanRoleSystemPrompt(input.role),
		plannerSubagentId: input.plannerSubagentId,
		attemptResume: input.attemptResume,
	});
}

export function roleForStage(stage: RalplanStage): RalplanAgentRole {
	if (stage === "pre-planner") return "explorer";
	if (stage === "planner" || stage === "revision") return "planner";
	if (stage === "architect") return "architect";
	if (stage === "critic") return "critic";
	if (stage === "expert-stage") return "expert";
	throw new Error(`no ralplan role agent for stage: ${stage}`);
}

function mergeExpertTools(tools: readonly string[] | undefined): readonly string[] {
	return Object.freeze([...new Set([...(tools ?? []), ...EXPERT_EXCLUDED_TOOLS])]);
}

function copyTools(tools: readonly string[] | undefined): readonly string[] | undefined {
	return tools === undefined ? undefined : Object.freeze([...tools]);
}

function requiredString(value: unknown, field: string): string {
	if (typeof value !== "string") throw new Error(`${field} must be a string`);
	if (value.trim().length === 0) throw new Error(`${field} must be non-empty`);
	if (value.trim() !== value) throw new Error(`${field} must not have surrounding whitespace`);
	return value;
}
