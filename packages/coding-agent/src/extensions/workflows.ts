import { type Static, Type } from "typebox";
import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext } from "../core/extensions/types.ts";
import {
	formatWorkflowHudLine,
	readWorkflowActiveState,
	syncWorkflowActiveState,
	type WorkflowActiveState,
} from "../workflows/active-state.ts";
import { deriveDeepInterviewHud } from "../workflows/deep-interview-hud.ts";
import {
	appendOrMergeDeepInterviewRound,
	enrichDeepInterviewRoundScoring,
	finalizeDeepInterviewSpecState,
	planDeepInterviewQuestion,
	readDeepInterviewStateCompact,
} from "../workflows/deep-interview-runtime.ts";
import { type DeepInterviewTriggerMetadata, projectCompactState } from "../workflows/deep-interview-state.ts";
import {
	deepInterviewIndexPath,
	deepInterviewSpecPath,
	type WorkflowSkill,
	workflowStatePath,
} from "../workflows/paths.ts";
import { ralplanRoleForStage, runRalplanAgent } from "../workflows/ralplan-agents.ts";
import {
	approveRalplanPlan,
	doctorRalplan,
	type RalplanPlannerFallbackReason,
	readRalplanCompactStatus,
	readRalplanStatus,
	writeRalplanArtifact,
} from "../workflows/ralplan-runtime.ts";
import { workflowReceipt } from "../workflows/receipts.ts";
import { assertRalplanStage, assertSafePathComponent, assertWorkflowSkill } from "../workflows/state-schema.ts";
import { appendJsonl, readFileOrLiteral, writeTextArtifact } from "../workflows/state-writer.ts";
import {
	completeTeam,
	createTeamTask,
	readTeamCompact,
	readTeamSnapshot,
	sendTeamMessage,
	startTeam,
	transitionTeamTask,
} from "../workflows/team-runtime.ts";
import {
	checkpointUltragoalGoal,
	createUltragoalPlan,
	getUltragoalStatus,
	readUltragoalCompact,
	startNextUltragoalGoal,
} from "../workflows/ultragoal-runtime.ts";
import {
	activeRalplanRunId,
	clearWorkflowState,
	defaultWorkflowId,
	readWorkflowState,
	writeWorkflowState,
} from "../workflows/workflow-state.ts";

const workflowStateSchema = Type.Object({
	skill: Type.String({ description: "Workflow skill name: deep-interview, ralplan, team, or ultragoal" }),
	action: Type.Optional(Type.String({ description: "read, write, or clear. Defaults to read." })),
	phase: Type.Optional(Type.String({ description: "Phase to set for write/clear actions" })),
	active: Type.Optional(Type.Boolean({ description: "Active flag for write actions" })),
	data: Type.Optional(
		Type.Record(Type.String(), Type.Unknown(), { description: "State fields to merge for write actions" }),
	),
});

type WorkflowStateInput = Static<typeof workflowStateSchema>;

const deepInterviewWriteSpecSchema = Type.Object({
	slug: Type.Optional(Type.String({ description: "Safe slug for .pi/specs/deep-interview-<slug>.md" })),
	spec: Type.String({ description: "Final spec markdown or a path to a markdown file" }),
	handoff: Type.Optional(Type.String({ description: "Optional next workflow: ralplan, ultragoal, team, or stop" })),
});

type DeepInterviewWriteSpecInput = Static<typeof deepInterviewWriteSpecSchema>;

const deepInterviewPlanQuestionSchema = Type.Object({
	round: Type.Number(),
	questionId: Type.Optional(Type.String()),
	questionText: Type.String(),
	component: Type.Optional(Type.String()),
	dimension: Type.Optional(Type.String()),
	ambiguity: Type.Optional(Type.Number()),
	rationale: Type.Optional(Type.String()),
});

type DeepInterviewPlanQuestionInput = Static<typeof deepInterviewPlanQuestionSchema>;

const deepInterviewRecordAnswerSchema = Type.Object({
	interviewId: Type.Optional(Type.String()),
	round: Type.Optional(Type.Number()),
	roundId: Type.Optional(Type.String()),
	questionId: Type.Optional(Type.String()),
	questionText: Type.Optional(Type.String()),
	component: Type.Optional(Type.String()),
	dimension: Type.Optional(Type.String()),
	ambiguity: Type.Optional(Type.Number()),
	selectedOptions: Type.Optional(Type.Array(Type.String())),
	customInput: Type.Optional(Type.String()),
});

type DeepInterviewRecordAnswerInput = Static<typeof deepInterviewRecordAnswerSchema>;

const deepInterviewTriggerSchema = Type.Object({
	kind: Type.String(),
	name: Type.String(),
	status: Type.String(),
	component: Type.String(),
	dimension: Type.String(),
	priorDimensionScore: Type.Optional(Type.Number()),
	newDimensionScore: Type.Optional(Type.Number()),
	priorAmbiguity: Type.Optional(Type.Number()),
	newAmbiguity: Type.Optional(Type.Number()),
	evidence: Type.Optional(Type.String()),
	contradictedFactId: Type.Optional(Type.String()),
	rationale: Type.Optional(Type.String()),
});

const deepInterviewRecordScoringSchema = Type.Object({
	interviewId: Type.Optional(Type.String()),
	round: Type.Number(),
	roundId: Type.Optional(Type.String()),
	questionId: Type.Optional(Type.String()),
	scores: Type.Record(Type.String(), Type.Number()),
	ambiguity: Type.Number(),
	triggers: Type.Optional(Type.Array(deepInterviewTriggerSchema)),
});

type DeepInterviewRecordScoringInput = Static<typeof deepInterviewRecordScoringSchema>;

const deepInterviewReadCompactSchema = Type.Object({
	lastN: Type.Optional(Type.Number()),
});

type DeepInterviewReadCompactInput = Static<typeof deepInterviewReadCompactSchema>;

const ralplanWriteArtifactSchema = Type.Object({
	stage: Type.String({ description: "planner, architect, critic, revision, adr, or final" }),
	stageN: Type.Number({ description: "Positive stage iteration number" }),
	artifact: Type.String({ description: "Artifact markdown or a path to a markdown file" }),
	runId: Type.Optional(Type.String({ description: "Safe run id. Defaults to active run or generated id." })),
	plannerSubagentId: Type.Optional(
		Type.String({ description: "Persisted Planner role-agent id for planner/revision stages." }),
	),
	plannerResumable: Type.Optional(Type.Boolean({ description: "Whether the Planner role-agent is known resumable." })),
	fallbackReason: Type.Optional(Type.String({ description: "Planner fallback reason when resume was unavailable." })),
	fallbackAttemptedId: Type.Optional(Type.String({ description: "Planner id whose resume was attempted." })),
	fallbackStageN: Type.Optional(Type.Number({ description: "Stage iteration where Planner fallback occurred." })),
	fallbackReceiptPath: Type.Optional(Type.String({ description: "Fresh fallback Planner artifact receipt/path." })),
});

type RalplanWriteArtifactInput = Static<typeof ralplanWriteArtifactSchema>;

const ralplanRunAgentSchema = Type.Object({
	role: Type.Optional(Type.String({ description: "planner, architect, or critic. Defaults from stage." })),
	task: Type.String({ description: "Role-agent task prompt." }),
	stage: Type.String({ description: "planner, architect, critic, or revision" }),
	stageN: Type.Number({ description: "Positive stage iteration number" }),
	runId: Type.Optional(Type.String({ description: "Safe run id. Defaults to active run." })),
	contextArtifacts: Type.Optional(
		Type.Array(Type.String({ description: "Persisted artifact paths/receipts to inspect." })),
	),
	deliberate: Type.Optional(Type.Boolean()),
	plannerSubagentId: Type.Optional(
		Type.String({ description: "Persisted Planner id to resume or route feedback to." }),
	),
	attemptResume: Type.Optional(
		Type.Boolean({ description: "Whether this pass is attempting to resume the persisted Planner." }),
	),
	fallbackReason: Type.Optional(Type.String({ description: "Fallback reason when Planner resume is unavailable." })),
	dryRun: Type.Optional(
		Type.Boolean({ description: "Plan and record the role-agent invocation without spawning Pi." }),
	),
});

type RalplanRunAgentInput = Static<typeof ralplanRunAgentSchema>;

const ralplanRunSchema = Type.Object({
	runId: Type.Optional(Type.String({ description: "Safe run id. Defaults to active run." })),
});

type RalplanRunInput = Static<typeof ralplanRunSchema>;

const ralplanApproveSchema = Type.Object({
	runId: Type.Optional(Type.String({ description: "Safe run id. Defaults to active run." })),
	approved: Type.Optional(Type.Boolean({ description: "Defaults to true. Set false to reject the pending plan." })),
	target: Type.Optional(Type.String({ description: "ultragoal, team, or stop. Defaults to ultragoal." })),
	note: Type.Optional(Type.String({ description: "Approval or rejection note." })),
});

type RalplanApproveInput = Static<typeof ralplanApproveSchema>;

const teamStartSchema = Type.Object({
	task: Type.String(),
	teamId: Type.Optional(Type.String()),
});
type TeamStartInput = Static<typeof teamStartSchema>;

const teamRunSchema = Type.Object({
	teamId: Type.Optional(Type.String()),
});
type TeamRunInput = Static<typeof teamRunSchema>;

const teamCreateTaskSchema = Type.Object({
	teamId: Type.Optional(Type.String()),
	id: Type.Optional(Type.String()),
	title: Type.String(),
	description: Type.String(),
	owner: Type.Optional(Type.String()),
	dependsOn: Type.Optional(Type.Array(Type.String())),
});
type TeamCreateTaskInput = Static<typeof teamCreateTaskSchema>;

const teamTransitionTaskSchema = Type.Object({
	teamId: Type.Optional(Type.String()),
	taskId: Type.String(),
	status: Type.String(),
	workerId: Type.Optional(Type.String()),
	evidence: Type.Optional(
		Type.Object({
			summary: Type.String(),
			files: Type.Optional(Type.Array(Type.String())),
			verification: Type.Optional(Type.Array(Type.String())),
			recorded_by: Type.String(),
		}),
	),
});
type TeamTransitionTaskInput = Static<typeof teamTransitionTaskSchema>;

const teamMessageSchema = Type.Object({
	teamId: Type.Optional(Type.String()),
	from: Type.String(),
	to: Type.String(),
	body: Type.String(),
	idempotencyKey: Type.Optional(Type.String()),
});
type TeamMessageInput = Static<typeof teamMessageSchema>;

const teamCompleteSchema = Type.Object({
	teamId: Type.Optional(Type.String()),
	phase: Type.Optional(Type.String()),
	summary: Type.Optional(Type.String()),
});
type TeamCompleteInput = Static<typeof teamCompleteSchema>;

const ultragoalCreatePlanSchema = Type.Object({
	brief: Type.String(),
	goalMode: Type.Optional(Type.String()),
});
type UltragoalCreatePlanInput = Static<typeof ultragoalCreatePlanSchema>;

const ultragoalCheckpointSchema = Type.Object({
	goalId: Type.String(),
	status: Type.String(),
	evidence: Type.Optional(Type.String()),
	qualityGate: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
});
type UltragoalCheckpointInput = Static<typeof ultragoalCheckpointSchema>;

const ultragoalStartNextSchema = Type.Object({
	retryFailed: Type.Optional(Type.Boolean()),
});
type UltragoalStartNextInput = Static<typeof ultragoalStartNextSchema>;

const subagentSpawnSchema = Type.Object({
	role: Type.String({ description: "Subagent role label." }),
	prompt: Type.String({ description: "User task prompt for the subagent." }),
	systemPrompt: Type.Optional(Type.String({ description: "Additional role/system instructions." })),
	tools: Type.Optional(Type.Array(Type.String({ description: "Allowed tool names for this subagent." }))),
	persistent: Type.Optional(Type.Boolean({ description: "Defaults to true. False uses an in-memory session." })),
	detached: Type.Optional(Type.Boolean({ description: "Return immediately after spawning." })),
	label: Type.Optional(Type.String({ description: "Human-readable subagent label." })),
});
type SubagentSpawnInput = Static<typeof subagentSpawnSchema>;

const subagentIdSchema = Type.Object({
	id: Type.String({ description: "Subagent id." }),
});
type SubagentIdInput = Static<typeof subagentIdSchema>;

const subagentStatusSchema = Type.Object({
	id: Type.Optional(Type.String({ description: "Subagent id. Omit to list recent records." })),
	limit: Type.Optional(Type.Number({ description: "Maximum records when listing. Defaults to 10." })),
});
type SubagentStatusInput = Static<typeof subagentStatusSchema>;

const subagentAwaitSchema = Type.Object({
	id: Type.String({ description: "Subagent id." }),
	timeoutMs: Type.Optional(
		Type.Number({ description: "Await timeout in milliseconds. Returns reason=timeout when exceeded." }),
	),
});
type SubagentAwaitInput = Static<typeof subagentAwaitSchema>;

const subagentResumeSchema = Type.Object({
	id: Type.String({ description: "Subagent id." }),
	message: Type.String({ description: "Follow-up message to resume the saved subagent context." }),
});
type SubagentResumeInput = Static<typeof subagentResumeSchema>;

const subagentSteerSchema = Type.Object({
	id: Type.String({ description: "Subagent id." }),
	message: Type.String({ description: "Steering message to inject into the live subagent." }),
	delivery: Type.Optional(Type.String({ description: "steer (default) or followUp delivery mode." })),
});
type SubagentSteerInput = Static<typeof subagentSteerSchema>;

const subagentPauseSchema = Type.Object({
	id: Type.String({ description: "Subagent id." }),
});
type SubagentPauseInput = Static<typeof subagentPauseSchema>;

type DeepInterviewHandoff = "ralplan" | "team" | "ultragoal" | "stop";
type RalplanApprovalTarget = "ultragoal" | "team" | "stop";

function assertDeepInterviewHandoff(value: string | undefined): asserts value is DeepInterviewHandoff | undefined {
	if (value === undefined) return;
	if (!["ralplan", "team", "ultragoal", "stop"].includes(value)) throw new Error(`unknown handoff workflow: ${value}`);
}

function assertRalplanApprovalTarget(value: string | undefined): asserts value is RalplanApprovalTarget | undefined {
	if (value === undefined) return;
	if (!["ultragoal", "team", "stop"].includes(value)) throw new Error(`unknown ralplan approval target: ${value}`);
}

function assertRalplanRole(value: string | undefined): asserts value is "planner" | "architect" | "critic" | undefined {
	if (value === undefined) return;
	if (!["planner", "architect", "critic"].includes(value)) throw new Error(`unknown ralplan agent role: ${value}`);
}

function assertRalplanFallbackReason(
	value: string | undefined,
): asserts value is RalplanPlannerFallbackReason | undefined {
	if (value === undefined) return;
	if (
		!["context_unavailable", "not_found", "no_runner", "resume_failed", "process_restart", "missing_record"].includes(
			value,
		)
	) {
		throw new Error(`invalid ralplan fallback reason: ${value}`);
	}
}

function resolveDeepInterviewSeed(args: string): {
	mode: "quick" | "standard" | "deep";
	threshold: number;
	idea: string;
} {
	const tokens = args.split(/\s+/).filter(Boolean);
	const mode = tokens.includes("--quick") ? "quick" : tokens.includes("--deep") ? "deep" : "standard";
	const threshold = mode === "quick" ? 0.6 : mode === "deep" ? 0.35 : 0.5;
	const idea = tokens.filter((token) => token !== "--quick" && token !== "--standard" && token !== "--deep").join(" ");
	return { mode, threshold, idea };
}

async function seedWorkflow(ctx: ExtensionCommandContext, skill: WorkflowSkill, args: string): Promise<void> {
	const phase = skill === "ralplan" ? "planner" : skill === "deep-interview" ? "interviewing" : "approved-execution";
	const patch: Record<string, unknown> = {
		active: true,
		current_phase: phase,
		input: args,
	};
	if (skill === "deep-interview") {
		const seed = resolveDeepInterviewSeed(args);
		patch.mode = seed.mode;
		patch.resolution = seed.mode;
		patch.threshold = seed.threshold;
		patch.threshold_source = `flag:--${seed.mode}`;
		patch.state = {
			initial_idea: seed.idea,
			rounds: [],
			established_facts: [],
			current_ambiguity: 1,
			threshold: seed.threshold,
			threshold_source: `flag:--${seed.mode}`,
			orchestration: { status: "interviewing", question_plan: [] },
		};
	}
	if (skill === "ralplan") {
		patch.run_id = (await activeRalplanRunId(ctx.cwd)) ?? defaultWorkflowId("ralplan");
	}
	const state = await writeWorkflowState(ctx.cwd, skill, patch);
	await syncWorkflowActiveState(ctx.cwd, {
		skill,
		active: state.active,
		phase: state.current_phase,
		state_path: workflowStatePath(ctx.cwd, skill),
		hud: skill === "deep-interview" ? deriveDeepInterviewHud(state, { phase: state.current_phase }) : undefined,
	});
}

function registerWorkflowCommand(pi: ExtensionAPI, skill: WorkflowSkill, description: string): void {
	pi.registerCommand(skill, {
		description,
		handler: async (args, ctx) => {
			await seedWorkflow(ctx, skill, args);
			ctx.ui.notify(`${skill} state initialized under .pi/workflows/${skill}/state.json`, "info");
			pi.sendUserMessage(`/skill:${skill} ${args}`.trim());
		},
	});
}

async function executeWorkflowState(params: WorkflowStateInput, ctx: ExtensionContext) {
	assertWorkflowSkill(params.skill);
	const action = params.action ?? "read";
	if (action === "read") {
		const state = (await readWorkflowState(ctx.cwd, params.skill)) ?? null;
		return {
			content: [{ type: "text" as const, text: JSON.stringify({ state }, null, 2) }],
			details: workflowReceipt({ state, path: workflowStatePath(ctx.cwd, params.skill) }),
		};
	}
	if (action === "write") {
		const patch: Record<string, unknown> = { ...(params.data ?? {}) };
		if (params.phase) patch.current_phase = params.phase;
		if (typeof params.active === "boolean") patch.active = params.active;
		const state = await writeWorkflowState(ctx.cwd, params.skill, patch);
		await syncWorkflowActiveState(ctx.cwd, {
			skill: params.skill,
			active: state.active,
			phase: state.current_phase,
			state_path: workflowStatePath(ctx.cwd, params.skill),
			hud:
				params.skill === "deep-interview"
					? deriveDeepInterviewHud(state, { phase: state.current_phase })
					: undefined,
		});
		return {
			content: [{ type: "text" as const, text: `Updated ${workflowStatePath(ctx.cwd, params.skill)}` }],
			details: workflowReceipt({ state, path: workflowStatePath(ctx.cwd, params.skill) }),
		};
	}
	if (action === "clear") {
		const state = await clearWorkflowState(ctx.cwd, params.skill, {
			current_phase: params.phase ?? "complete",
			...(params.data ?? {}),
		});
		await syncWorkflowActiveState(ctx.cwd, {
			skill: params.skill,
			active: state.active,
			phase: state.current_phase,
			state_path: workflowStatePath(ctx.cwd, params.skill),
			hud:
				params.skill === "deep-interview"
					? deriveDeepInterviewHud(state, { phase: state.current_phase })
					: undefined,
		});
		return {
			content: [{ type: "text" as const, text: `Cleared ${params.skill} workflow state` }],
			details: workflowReceipt({ state, path: workflowStatePath(ctx.cwd, params.skill) }),
		};
	}
	throw new Error(`unknown workflow state action: ${action}`);
}

async function executeDeepInterviewPlanQuestion(params: DeepInterviewPlanQuestionInput, ctx: ExtensionContext) {
	const result = await planDeepInterviewQuestion(ctx.cwd, {
		round: params.round,
		questionId: params.questionId,
		questionText: params.questionText,
		component: params.component,
		dimension: params.dimension,
		ambiguity: params.ambiguity,
		rationale: params.rationale,
	});
	return {
		content: [{ type: "text" as const, text: `Planned deep-interview question round ${params.round}` }],
		details: workflowReceipt({ ...result }),
	};
}

function normalizeDeepInterviewTriggers(
	triggers: DeepInterviewRecordScoringInput["triggers"],
): DeepInterviewTriggerMetadata[] | undefined {
	if (!triggers) return undefined;
	return triggers.map((trigger) => {
		if (!["A", "B", "C", "D"].includes(trigger.kind)) throw new Error(`invalid trigger kind: ${trigger.kind}`);
		if (!["active", "disputed", "unresolved"].includes(trigger.status)) {
			throw new Error(`invalid trigger status: ${trigger.status}`);
		}
		return trigger as DeepInterviewTriggerMetadata;
	});
}

async function executeDeepInterviewRecordAnswer(params: DeepInterviewRecordAnswerInput, ctx: ExtensionContext) {
	const result = await appendOrMergeDeepInterviewRound(ctx.cwd, {
		interviewId: params.interviewId,
		round: params.round,
		round_id: params.roundId,
		questionId: params.questionId,
		questionText: params.questionText,
		component: params.component,
		dimension: params.dimension,
		ambiguity: params.ambiguity,
		selectedOptions: params.selectedOptions,
		customInput: params.customInput,
	});
	return {
		content: [
			{
				type: "text" as const,
				text: `Recorded deep-interview answer round ${result.record.round} (${result.action})`,
			},
		],
		details: workflowReceipt({ ...result }),
	};
}

async function executeDeepInterviewRecordScoring(params: DeepInterviewRecordScoringInput, ctx: ExtensionContext) {
	const result = await enrichDeepInterviewRoundScoring(ctx.cwd, {
		interviewId: params.interviewId,
		round: params.round,
		round_id: params.roundId,
		questionId: params.questionId,
		scores: params.scores,
		ambiguity: params.ambiguity,
		triggers: normalizeDeepInterviewTriggers(params.triggers),
	});
	return {
		content: [{ type: "text" as const, text: `Recorded deep-interview scoring round ${params.round}` }],
		details: workflowReceipt({ ...result }),
	};
}

async function executeDeepInterviewReadCompact(params: DeepInterviewReadCompactInput, ctx: ExtensionContext) {
	const result = await readDeepInterviewStateCompact(ctx.cwd, params.lastN);
	return {
		content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
		details: workflowReceipt({ ...result }),
	};
}

async function executeDeepInterviewWriteSpec(params: DeepInterviewWriteSpecInput, ctx: ExtensionContext) {
	assertDeepInterviewHandoff(params.handoff);
	const slug = params.slug?.trim() || defaultWorkflowId("spec");
	assertSafePathComponent(slug, "slug");
	const content = await readFileOrLiteral(params.spec, ctx.cwd);
	const result = await writeTextArtifact(deepInterviewSpecPath(ctx.cwd, slug), content, { cwd: ctx.cwd });
	await appendJsonl(
		deepInterviewIndexPath(ctx.cwd),
		{
			slug,
			path: result.path,
			sha256: result.sha256,
			created_at: result.createdAt,
		},
		{ cwd: ctx.cwd },
	);
	await finalizeDeepInterviewSpecState(ctx.cwd, {
		slug,
		path: result.path,
		sha256: result.sha256,
		handoff: params.handoff,
	});
	if (params.handoff === "ralplan") {
		const state = await writeWorkflowState(ctx.cwd, "ralplan", {
			active: true,
			current_phase: "planner",
			run_id: (await activeRalplanRunId(ctx.cwd)) ?? defaultWorkflowId("ralplan"),
			input: result.path,
		});
		await syncWorkflowActiveState(ctx.cwd, {
			skill: "ralplan",
			active: state.active,
			phase: state.current_phase,
			state_path: workflowStatePath(ctx.cwd, "ralplan"),
		});
	} else if (params.handoff === "team" || params.handoff === "ultragoal") {
		const state = await writeWorkflowState(ctx.cwd, params.handoff, {
			active: true,
			current_phase: "approved-execution",
			input: result.path,
		});
		await syncWorkflowActiveState(ctx.cwd, {
			skill: params.handoff,
			active: state.active,
			phase: state.current_phase,
			state_path: workflowStatePath(ctx.cwd, params.handoff),
		});
	}
	return {
		content: [{ type: "text" as const, text: `Persisted deep-interview spec at ${result.path}` }],
		details: workflowReceipt({ slug, path: result.path, sha256: result.sha256, handoff: params.handoff }),
	};
}

async function syncWorkflowHudUi(ctx: ExtensionContext): Promise<void> {
	let active: WorkflowActiveState | undefined;
	try {
		active = await readWorkflowActiveState(ctx.cwd);
	} catch {
		ctx.ui.setStatus("workflow", undefined);
		ctx.ui.setWidget("workflow", undefined);
		return;
	}
	const entries = active?.active_workflows ?? [];
	if (entries.length === 0) {
		ctx.ui.setStatus("workflow", undefined);
		ctx.ui.setWidget("workflow", undefined);
		return;
	}
	const lines = entries.map(formatWorkflowHudLine);
	ctx.ui.setStatus("workflow", lines[0]);
	if (ctx.mode === "tui") ctx.ui.setWidget("workflow", ["Workflow", ...lines], { placement: "aboveEditor" });
}

async function buildDeepInterviewContinuationPrompt(cwd: string): Promise<string | undefined> {
	const active = await readWorkflowActiveState(cwd).catch(() => undefined);
	const deepInterview = active?.active_workflows.find((entry) => entry.skill === "deep-interview" && entry.active);
	if (!deepInterview) return undefined;
	const state = await readWorkflowState(cwd, "deep-interview").catch(() => undefined);
	if (!state || state.active === false) return undefined;
	const compact = projectCompactState(state, { lastN: 3 });
	return [
		"Active Pi deep-interview runtime context:",
		JSON.stringify(
			{ state_path: workflowStatePath(cwd, "deep-interview"), hud: deepInterview.hud, compact },
			null,
			2,
		),
		"Continue the interview autonomously using runtime orchestration state. If orchestration.status is waiting_for_answer, treat the user's message as the answer to orchestration.next_question and call deep_interview_record_answer without restating question metadata unless needed. If status is pending_scoring, call deep_interview_record_scoring before asking another question. If no question is pending and ambiguity is above threshold, call deep_interview_plan_question before asking exactly one next Socratic question. If ambiguity is at or below threshold, restate the goal and ask for confirmation before deep_interview_write_spec.",
	].join("\n");
}

function requireSubagentManager(ctx: ExtensionContext) {
	if (!ctx.subagents) throw new Error("No subagent manager is available in this session.");
	return ctx.subagents;
}

async function executeSubagentSpawn(params: SubagentSpawnInput, ctx: ExtensionContext, signal?: AbortSignal) {
	const result = await requireSubagentManager(ctx).spawn({
		role: params.role,
		prompt: params.prompt,
		systemPrompt: params.systemPrompt,
		tools: params.tools,
		persistent: params.persistent,
		detached: params.detached,
		label: params.label,
		signal,
	});
	return {
		content: [{ type: "text" as const, text: `Subagent ${result.record.id} ${result.record.status}` }],
		details: workflowReceipt({ record: result.record, output: result.output }),
	};
}

async function executeSubagentStatus(params: SubagentStatusInput, ctx: ExtensionContext) {
	const manager = requireSubagentManager(ctx);
	if (params.id) {
		const record = await manager.read(params.id);
		return {
			content: [{ type: "text" as const, text: JSON.stringify({ record: record ?? null }, null, 2) }],
			details: workflowReceipt({ record: record ?? null }),
		};
	}
	const limit = Math.max(1, Math.min(50, Math.floor(params.limit ?? 10)));
	const records = (await manager.list()).slice(0, limit);
	return {
		content: [{ type: "text" as const, text: JSON.stringify({ records }, null, 2) }],
		details: workflowReceipt({ records }),
	};
}

async function executeSubagentAwait(params: SubagentAwaitInput, ctx: ExtensionContext) {
	const result = await requireSubagentManager(ctx).waitFor(params.id, { timeoutMs: params.timeoutMs });
	if (!result.ok) {
		return {
			content: [
				{
					type: "text" as const,
					text:
						result.reason === "timeout"
							? `Subagent ${params.id} await timed out after ${params.timeoutMs}ms`
							: `Subagent ${params.id} not found`,
				},
			],
			details: workflowReceipt({ ok: false, reason: result.reason, record: result.record }),
		};
	}
	return {
		content: [{ type: "text" as const, text: `Subagent ${result.result.record.id} ${result.result.record.status}` }],
		details: workflowReceipt({ ok: true, record: result.result.record, output: result.result.output }),
	};
}

async function executeSubagentResume(params: SubagentResumeInput, ctx: ExtensionContext, signal?: AbortSignal) {
	const result = await requireSubagentManager(ctx).resume(params.id, params.message, { signal });
	if (!result.ok) {
		return {
			content: [{ type: "text" as const, text: `Subagent ${params.id} resume failed: ${result.reason}` }],
			details: workflowReceipt({ ok: false, reason: result.reason, record: result.record }),
		};
	}
	return {
		content: [{ type: "text" as const, text: `Subagent ${result.result.record.id} ${result.result.record.status}` }],
		details: workflowReceipt({ ok: true, record: result.result.record, output: result.result.output }),
	};
}

async function executeSubagentSteer(params: SubagentSteerInput, ctx: ExtensionContext) {
	const delivery = params.delivery === "followUp" ? "followUp" : "steer";
	const result = await requireSubagentManager(ctx).steer(params.id, params.message, delivery);
	if (!result.ok) {
		return {
			content: [{ type: "text" as const, text: `Subagent ${params.id} steer failed: ${result.reason}` }],
			details: workflowReceipt({ ok: false, reason: result.reason, record: result.record }),
		};
	}
	return {
		content: [{ type: "text" as const, text: `Subagent ${result.result.record.id} steered` }],
		details: workflowReceipt({ ok: true, record: result.result.record }),
	};
}

async function executeSubagentPause(params: SubagentPauseInput, ctx: ExtensionContext) {
	const result = await requireSubagentManager(ctx).pause(params.id);
	return {
		content: [
			{
				type: "text" as const,
				text: result.ok
					? `Subagent ${result.record?.id} paused`
					: `Subagent ${params.id} pause failed: ${result.reason}`,
			},
		],
		details: workflowReceipt({ ok: result.ok, reason: result.reason, record: result.record }),
	};
}

async function executeSubagentCancel(params: SubagentIdInput, ctx: ExtensionContext) {
	const record = await requireSubagentManager(ctx).cancel(params.id);
	return {
		content: [
			{
				type: "text" as const,
				text: record ? `Subagent ${record.id} cancelled` : `Subagent ${params.id} not found`,
			},
		],
		details: workflowReceipt({ record: record ?? null }),
	};
}

async function executeRalplanRunAgent(params: RalplanRunAgentInput, ctx: ExtensionContext, signal?: AbortSignal) {
	assertRalplanStage(params.stage);
	assertRalplanRole(params.role);
	assertRalplanFallbackReason(params.fallbackReason);
	if (
		params.stage !== "planner" &&
		params.stage !== "architect" &&
		params.stage !== "critic" &&
		params.stage !== "revision"
	) {
		throw new Error(`ralplan role agents cannot produce stage: ${params.stage}`);
	}
	if (!Number.isInteger(params.stageN) || params.stageN < 1 || params.stageN > 999) {
		throw new Error(`invalid stageN: ${params.stageN}`);
	}
	if (params.runId) assertSafePathComponent(params.runId, "runId");
	const role = params.role ?? ralplanRoleForStage(params.stage);
	const result = await runRalplanAgent(
		ctx.cwd,
		{
			role,
			task: params.task,
			stage: params.stage,
			stageN: params.stageN,
			runId: params.runId,
			contextArtifacts: params.contextArtifacts,
			deliberate: params.deliberate,
			plannerSubagentId: params.plannerSubagentId,
			attemptResume: params.attemptResume,
			fallbackReason: params.fallbackReason,
			dryRun: params.dryRun,
			subagentManager: ctx.subagents,
		},
		signal,
	);
	return {
		content: [
			{
				type: "text" as const,
				text: `${result.role} agent ${result.status} for ralplan ${result.stage} stage ${result.stage_n}`,
			},
		],
		details: workflowReceipt({ ...result }),
	};
}

async function executeRalplanWriteArtifact(params: RalplanWriteArtifactInput, ctx: ExtensionContext) {
	assertRalplanStage(params.stage);
	if (!Number.isInteger(params.stageN) || params.stageN < 1 || params.stageN > 999) {
		throw new Error(`invalid stageN: ${params.stageN}`);
	}
	if (params.runId) assertSafePathComponent(params.runId, "runId");
	assertRalplanFallbackReason(params.fallbackReason);
	const result = await writeRalplanArtifact(ctx.cwd, {
		stage: params.stage,
		stageN: params.stageN,
		artifact: params.artifact,
		runId: params.runId,
		plannerSubagentId: params.plannerSubagentId,
		plannerResumable: params.plannerResumable,
		fallbackReason: params.fallbackReason,
		fallbackAttemptedId: params.fallbackAttemptedId,
		fallbackStageN: params.fallbackStageN,
		fallbackReceiptPath: params.fallbackReceiptPath,
	});
	return {
		content: [
			{
				type: "text" as const,
				text: result.deduplicated
					? `Ralplan ${params.stage} stage ${params.stageN} already persisted at ${result.path}`
					: `Persisted ralplan ${params.stage} stage ${params.stageN} at ${result.path}`,
			},
		],
		details: workflowReceipt({ ...result }),
	};
}

async function executeRalplanStatus(params: RalplanRunInput, ctx: ExtensionContext) {
	if (params.runId) assertSafePathComponent(params.runId, "runId");
	const status = await readRalplanStatus(ctx.cwd, params.runId);
	return {
		content: [{ type: "text" as const, text: JSON.stringify(status, null, 2) }],
		details: workflowReceipt({ ...status }),
	};
}

async function executeRalplanReadCompact(params: RalplanRunInput, ctx: ExtensionContext) {
	if (params.runId) assertSafePathComponent(params.runId, "runId");
	const status = await readRalplanCompactStatus(ctx.cwd, params.runId);
	return {
		content: [{ type: "text" as const, text: JSON.stringify(status, null, 2) }],
		details: workflowReceipt({ ...status }),
	};
}

async function executeRalplanApprove(params: RalplanApproveInput, ctx: ExtensionContext) {
	if (params.runId) assertSafePathComponent(params.runId, "runId");
	assertRalplanApprovalTarget(params.target);
	const result = await approveRalplanPlan(ctx.cwd, {
		runId: params.runId,
		approved: params.approved,
		target: params.target,
		note: params.note,
	});
	return {
		content: [
			{
				type: "text" as const,
				text: result.approved
					? `Approved ralplan ${result.runId} for ${result.target}`
					: `Rejected ralplan ${result.runId}`,
			},
		],
		details: workflowReceipt({ ...result }),
	};
}

async function executeRalplanDoctor(params: RalplanRunInput, ctx: ExtensionContext) {
	if (params.runId) assertSafePathComponent(params.runId, "runId");
	const result = await doctorRalplan(ctx.cwd, params.runId);
	return {
		content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
		details: workflowReceipt({ ...result }),
	};
}

async function executeTeamStart(params: TeamStartInput, ctx: ExtensionContext) {
	if (params.teamId) assertSafePathComponent(params.teamId, "teamId");
	const result = await startTeam(ctx.cwd, { task: params.task, teamId: params.teamId });
	return {
		content: [{ type: "text" as const, text: `Started team ${result.team_id}` }],
		details: workflowReceipt({ ...result }),
	};
}

async function executeTeamSnapshot(params: TeamRunInput, ctx: ExtensionContext) {
	if (params.teamId) assertSafePathComponent(params.teamId, "teamId");
	const result = await readTeamSnapshot(ctx.cwd, params.teamId);
	return {
		content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
		details: workflowReceipt({ ...result }),
	};
}

async function executeTeamReadCompact(params: TeamRunInput, ctx: ExtensionContext) {
	if (params.teamId) assertSafePathComponent(params.teamId, "teamId");
	const result = await readTeamCompact(ctx.cwd, params.teamId);
	return {
		content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
		details: workflowReceipt({ ...result }),
	};
}

async function executeTeamCreateTask(params: TeamCreateTaskInput, ctx: ExtensionContext) {
	if (params.teamId) assertSafePathComponent(params.teamId, "teamId");
	if (params.id) assertSafePathComponent(params.id, "taskId");
	const result = await createTeamTask(ctx.cwd, params);
	return {
		content: [{ type: "text" as const, text: `Created team task ${result.id}` }],
		details: workflowReceipt({ ...result }),
	};
}

async function executeTeamTransitionTask(params: TeamTransitionTaskInput, ctx: ExtensionContext) {
	if (params.teamId) assertSafePathComponent(params.teamId, "teamId");
	assertSafePathComponent(params.taskId, "taskId");
	if (params.workerId) assertSafePathComponent(params.workerId, "workerId");
	const result = await transitionTeamTask(ctx.cwd, params);
	return {
		content: [{ type: "text" as const, text: `Updated team task ${result.id} to ${result.status}` }],
		details: workflowReceipt({ ...result }),
	};
}

async function executeTeamMessage(params: TeamMessageInput, ctx: ExtensionContext) {
	if (params.teamId) assertSafePathComponent(params.teamId, "teamId");
	assertSafePathComponent(params.from, "from");
	assertSafePathComponent(params.to, "to");
	const result = await sendTeamMessage(ctx.cwd, params);
	return {
		content: [{ type: "text" as const, text: `Sent team message ${result.message_id}` }],
		details: workflowReceipt(result),
	};
}

async function executeTeamComplete(params: TeamCompleteInput, ctx: ExtensionContext) {
	if (params.teamId) assertSafePathComponent(params.teamId, "teamId");
	if (
		params.phase !== undefined &&
		params.phase !== "complete" &&
		params.phase !== "failed" &&
		params.phase !== "cancelled"
	) {
		throw new Error(`invalid team completion phase: ${params.phase}`);
	}
	const result = await completeTeam(ctx.cwd, {
		teamId: params.teamId,
		phase: params.phase,
		summary: params.summary,
	});
	return {
		content: [{ type: "text" as const, text: `Closed team ${result.team_id} as ${result.phase}` }],
		details: workflowReceipt({ ...result }),
	};
}

async function executeUltragoalCreatePlan(params: UltragoalCreatePlanInput, ctx: ExtensionContext) {
	if (params.goalMode !== undefined && params.goalMode !== "aggregate" && params.goalMode !== "per-story") {
		throw new Error(`invalid ultragoal goalMode: ${params.goalMode}`);
	}
	const result = await createUltragoalPlan(ctx.cwd, { brief: params.brief, goalMode: params.goalMode });
	return {
		content: [{ type: "text" as const, text: `Created ultragoal plan with ${result.goals.length} goals` }],
		details: workflowReceipt({ ...result }),
	};
}

async function executeUltragoalStatus(_params: object, ctx: ExtensionContext) {
	const result = await getUltragoalStatus(ctx.cwd);
	return {
		content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
		details: workflowReceipt({ ...result }),
	};
}

async function executeUltragoalReadCompact(_params: object, ctx: ExtensionContext) {
	const result = await readUltragoalCompact(ctx.cwd);
	return {
		content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
		details: workflowReceipt(result),
	};
}

async function executeUltragoalStartNext(params: UltragoalStartNextInput, ctx: ExtensionContext) {
	const result = await startNextUltragoalGoal(ctx.cwd, params.retryFailed);
	return {
		content: [
			{
				type: "text" as const,
				text: result.goal ? `Started ultragoal ${result.goal.id}` : "No runnable ultragoal goal",
			},
		],
		details: workflowReceipt({ ...result }),
	};
}

async function executeUltragoalCheckpoint(params: UltragoalCheckpointInput, ctx: ExtensionContext) {
	const result = await checkpointUltragoalGoal(ctx.cwd, params);
	return {
		content: [{ type: "text" as const, text: `Checkpointed ultragoal ${result.id} as ${result.status}` }],
		details: workflowReceipt({ ...result }),
	};
}

export default function workflowsExtension(pi: ExtensionAPI): void {
	pi.on("session_start", async (_event, ctx) => {
		await syncWorkflowHudUi(ctx);
	});
	pi.on("turn_end", async (_event, ctx) => {
		await syncWorkflowHudUi(ctx);
	});
	pi.on("tool_execution_end", async (_event, ctx) => {
		await syncWorkflowHudUi(ctx);
	});
	pi.on("before_agent_start", async (event, ctx) => {
		if (ctx.skipWorkflowContinuation) return undefined;
		await syncWorkflowHudUi(ctx);
		const continuationPrompt = await buildDeepInterviewContinuationPrompt(ctx.cwd);
		if (!continuationPrompt) return undefined;
		return { systemPrompt: `${event.systemPrompt}\n\n${continuationPrompt}` };
	});

	registerWorkflowCommand(pi, "deep-interview", "Start a Socratic requirements interview");
	registerWorkflowCommand(pi, "ralplan", "Start consensus planning and persist a pending-approval plan");
	registerWorkflowCommand(pi, "team", "Coordinate approved parallel execution workstreams");
	registerWorkflowCommand(pi, "ultragoal", "Run approved goal-tracked autonomous execution");

	pi.registerTool({
		name: "pi_workflow_state",
		label: "Pi Workflow State",
		description: "Read, write, or clear Pi workflow state under .pi/workflows/<skill>/state.json.",
		promptSnippet: "Read/write Pi workflow state for deep-interview, ralplan, team, and ultragoal",
		promptGuidelines: ["Use pi_workflow_state instead of direct edits when reading or updating .pi/workflows state."],
		parameters: workflowStateSchema,
		execute: async (_toolCallId, params, _signal, _onUpdate, ctx) => executeWorkflowState(params, ctx),
	});

	pi.registerTool({
		name: "deep_interview_plan_question",
		label: "Deep Interview Question Plan",
		description: "Plan the next deep-interview question and mark the workflow as waiting for an answer.",
		promptSnippet: "Plan the next deep-interview question before asking the user",
		promptGuidelines: [
			"Use deep_interview_plan_question immediately before asking a deep-interview question so the next user answer can be recorded against the pending question.",
		],
		parameters: deepInterviewPlanQuestionSchema,
		execute: async (_toolCallId, params, _signal, _onUpdate, ctx) => executeDeepInterviewPlanQuestion(params, ctx),
	});

	pi.registerTool({
		name: "deep_interview_record_answer",
		label: "Deep Interview Answer",
		description: "Record or replace one answered deep-interview round in .pi workflow state.",
		promptSnippet: "Record deep-interview answer shells in workflow state",
		promptGuidelines: [
			"Use deep_interview_record_answer after each deep-interview question is answered instead of editing workflow state directly.",
		],
		parameters: deepInterviewRecordAnswerSchema,
		execute: async (_toolCallId, params, _signal, _onUpdate, ctx) => executeDeepInterviewRecordAnswer(params, ctx),
	});

	pi.registerTool({
		name: "deep_interview_record_scoring",
		label: "Deep Interview Scoring",
		description: "Enrich a deep-interview round with scores, ambiguity, and trigger metadata.",
		promptSnippet: "Record deep-interview scoring and ambiguity transitions",
		promptGuidelines: [
			"Use deep_interview_record_scoring after scoring each deep-interview answer; invalid ambiguity-raising transitions are rejected.",
		],
		parameters: deepInterviewRecordScoringSchema,
		execute: async (_toolCallId, params, _signal, _onUpdate, ctx) => executeDeepInterviewRecordScoring(params, ctx),
	});

	pi.registerTool({
		name: "deep_interview_read_compact",
		label: "Deep Interview Compact State",
		description: "Read a compact deep-interview state projection for prompt-efficient continuation.",
		promptSnippet: "Read compact deep-interview state for continuation",
		promptGuidelines: [
			"Use deep_interview_read_compact when continuing a deep interview instead of loading the full transcript unless necessary.",
		],
		parameters: deepInterviewReadCompactSchema,
		execute: async (_toolCallId, params, _signal, _onUpdate, ctx) => executeDeepInterviewReadCompact(params, ctx),
	});

	pi.registerTool({
		name: "deep_interview_write_spec",
		label: "Deep Interview Spec",
		description: "Persist a final deep-interview spec under .pi/specs and update workflow state.",
		promptSnippet: "Persist final deep-interview specs under .pi/specs",
		promptGuidelines: [
			"Use deep_interview_write_spec to persist final deep-interview specs; do not write .pi/specs directly.",
		],
		parameters: deepInterviewWriteSpecSchema,
		execute: async (_toolCallId, params, _signal, _onUpdate, ctx) => executeDeepInterviewWriteSpec(params, ctx),
	});

	pi.registerTool({
		name: "subagent_spawn",
		label: "Subagent Spawn",
		description: "Spawn a Pi-native subagent session with optional restricted tools and persistence.",
		promptSnippet: "Spawn a durable Pi subagent for isolated work",
		promptGuidelines: ["Use subagent_spawn when work should run in an isolated agent context."],
		parameters: subagentSpawnSchema,
		execute: async (_toolCallId, params, signal, _onUpdate, ctx) => executeSubagentSpawn(params, ctx, signal),
	});

	pi.registerTool({
		name: "subagent_status",
		label: "Subagent Status",
		description: "Read one subagent record or list recent subagent records.",
		promptSnippet: "Inspect Pi-native subagent records",
		promptGuidelines: ["Use subagent_status before resuming or auditing subagent work."],
		parameters: subagentStatusSchema,
		execute: async (_toolCallId, params, _signal, _onUpdate, ctx) => executeSubagentStatus(params, ctx),
	});

	pi.registerTool({
		name: "subagent_await",
		label: "Subagent Await",
		description: "Await a live subagent or read its terminal result.",
		promptSnippet: "Await Pi-native subagent completion",
		promptGuidelines: ["Use subagent_await to collect a detached subagent result before integrating it."],
		parameters: subagentAwaitSchema,
		execute: async (_toolCallId, params, _signal, _onUpdate, ctx) => executeSubagentAwait(params, ctx),
	});

	pi.registerTool({
		name: "subagent_steer",
		label: "Subagent Steer",
		description: "Inject a steering message into a live subagent or resume it from saved context.",
		promptSnippet: "Steer a live Pi-native subagent",
		promptGuidelines: ["Use subagent_steer to redirect a running or saved subagent without restarting its context."],
		parameters: subagentSteerSchema,
		execute: async (_toolCallId, params, _signal, _onUpdate, ctx) => executeSubagentSteer(params, ctx),
	});

	pi.registerTool({
		name: "subagent_pause",
		label: "Subagent Pause",
		description: "Pause a running subagent at a safe boundary; its saved context remains resumable.",
		promptSnippet: "Pause a running Pi-native subagent",
		promptGuidelines: ["Use subagent_pause to suspend a subagent so it can be resumed later from its saved context."],
		parameters: subagentPauseSchema,
		execute: async (_toolCallId, params, _signal, _onUpdate, ctx) => executeSubagentPause(params, ctx),
	});

	pi.registerTool({
		name: "subagent_resume",
		label: "Subagent Resume",
		description: "Resume a saved persistent subagent session with a follow-up message.",
		promptSnippet: "Resume a Pi-native subagent from saved context",
		promptGuidelines: ["Use subagent_resume when a previous persistent subagent should continue from its context."],
		parameters: subagentResumeSchema,
		execute: async (_toolCallId, params, signal, _onUpdate, ctx) => executeSubagentResume(params, ctx, signal),
	});

	pi.registerTool({
		name: "subagent_cancel",
		label: "Subagent Cancel",
		description: "Cancel a live or durable subagent record.",
		promptSnippet: "Cancel a Pi-native subagent",
		promptGuidelines: ["Use subagent_cancel to stop work that should no longer continue."],
		parameters: subagentIdSchema,
		execute: async (_toolCallId, params, _signal, _onUpdate, ctx) => executeSubagentCancel(params, ctx),
	});

	pi.registerTool({
		name: "ralplan_run_agent",
		label: "Ralplan Role Agent",
		description:
			"Run an isolated Pi role agent for ralplan Planner, Architect, or Critic and record the invocation under .pi/workflows/ralplan/agents.",
		promptSnippet: "Run ralplan Planner/Architect/Critic role agents",
		promptGuidelines: [
			"Use ralplan_run_agent for Planner, Architect, Critic, and Planner revision passes instead of pretending one model persona reviewed itself inline.",
			"Role agents must persist durable output with ralplan_write_artifact and return receipt-only summaries.",
		],
		parameters: ralplanRunAgentSchema,
		execute: async (_toolCallId, params, signal, _onUpdate, ctx) => executeRalplanRunAgent(params, ctx, signal),
	});

	pi.registerTool({
		name: "ralplan_status",
		label: "Ralplan Status",
		description: "Read ralplan run state, index rows, stage summary, and pending approval status.",
		promptSnippet: "Read ralplan run status and persisted artifact index",
		promptGuidelines: ["Use ralplan_status before resuming or auditing a ralplan run."],
		parameters: ralplanRunSchema,
		execute: async (_toolCallId, params, _signal, _onUpdate, ctx) => executeRalplanStatus(params, ctx),
	});

	pi.registerTool({
		name: "ralplan_read_compact",
		label: "Ralplan Compact Status",
		description: "Read compact ralplan status for prompt-efficient continuation.",
		promptSnippet: "Read compact ralplan status for continuation",
		promptGuidelines: ["Use ralplan_read_compact when continuing ralplan without needing every index row."],
		parameters: ralplanRunSchema,
		execute: async (_toolCallId, params, _signal, _onUpdate, ctx) => executeRalplanReadCompact(params, ctx),
	});

	pi.registerTool({
		name: "ralplan_doctor",
		label: "Ralplan Doctor",
		description: "Validate ralplan index/artifact consistency and pending approval evidence.",
		promptSnippet: "Validate ralplan artifact/index consistency",
		promptGuidelines: ["Use ralplan_doctor when a ralplan run appears inconsistent before writing more artifacts."],
		parameters: ralplanRunSchema,
		execute: async (_toolCallId, params, _signal, _onUpdate, ctx) => executeRalplanDoctor(params, ctx),
	});

	pi.registerTool({
		name: "ralplan_approve_plan",
		label: "Ralplan Approval Gate",
		description: "Approve or reject a pending ralplan final plan and optionally hand off to ultragoal or team.",
		promptSnippet: "Record ralplan pending-plan approval or rejection",
		promptGuidelines: [
			"Use ralplan_approve_plan only after explicit user approval or rejection of the pending final plan.",
		],
		parameters: ralplanApproveSchema,
		execute: async (_toolCallId, params, _signal, _onUpdate, ctx) => executeRalplanApprove(params, ctx),
	});

	pi.registerTool({
		name: "ralplan_write_artifact",
		label: "Ralplan Artifact",
		description: "Persist ralplan stage artifacts under .pi/plans/ralplan/<run-id>/ and update workflow state.",
		promptSnippet: "Persist ralplan planner/architect/critic/final artifacts under .pi/plans",
		promptGuidelines: ["Use ralplan_write_artifact for ralplan planning artifacts; do not write .pi/plans directly."],
		parameters: ralplanWriteArtifactSchema,
		execute: async (_toolCallId, params, _signal, _onUpdate, ctx) => executeRalplanWriteArtifact(params, ctx),
	});

	pi.registerTool({
		name: "team_start",
		label: "Team Start",
		description: "Create Pi-native team coordination state under .pi/team/<team-id>.",
		promptSnippet: "Start a runtime-owned team coordination board",
		promptGuidelines: ["Use team_start only after execution is approved and parallel workstreams are useful."],
		parameters: teamStartSchema,
		execute: async (_toolCallId, params, _signal, _onUpdate, ctx) => executeTeamStart(params, ctx),
	});

	pi.registerTool({
		name: "team_snapshot",
		label: "Team Snapshot",
		description: "Read team workers, tasks, counts, and phase.",
		promptSnippet: "Read full team coordination snapshot",
		promptGuidelines: ["Use team_snapshot when auditing or integrating team work."],
		parameters: teamRunSchema,
		execute: async (_toolCallId, params, _signal, _onUpdate, ctx) => executeTeamSnapshot(params, ctx),
	});

	pi.registerTool({
		name: "team_read_compact",
		label: "Team Compact State",
		description: "Read compact team state for continuation.",
		promptSnippet: "Read compact team task/worker status",
		promptGuidelines: ["Use team_read_compact for prompt-efficient team continuation."],
		parameters: teamRunSchema,
		execute: async (_toolCallId, params, _signal, _onUpdate, ctx) => executeTeamReadCompact(params, ctx),
	});

	pi.registerTool({
		name: "team_create_task",
		label: "Team Task Create",
		description: "Create a durable team task.",
		promptSnippet: "Create team task with objective and ownership",
		promptGuidelines: ["Use team_create_task for each independent workstream before executing it."],
		parameters: teamCreateTaskSchema,
		execute: async (_toolCallId, params, _signal, _onUpdate, ctx) => executeTeamCreateTask(params, ctx),
	});

	pi.registerTool({
		name: "team_transition_task",
		label: "Team Task Transition",
		description: "Transition a team task with required completion evidence for completed tasks.",
		promptSnippet: "Update team task state and completion evidence",
		promptGuidelines: ["Use team_transition_task when starting, blocking, completing, or failing team tasks."],
		parameters: teamTransitionTaskSchema,
		execute: async (_toolCallId, params, _signal, _onUpdate, ctx) => executeTeamTransitionTask(params, ctx),
	});

	pi.registerTool({
		name: "team_send_message",
		label: "Team Message",
		description: "Append a durable mailbox message for a team participant.",
		promptSnippet: "Send team coordination mailbox message",
		promptGuidelines: ["Use team_send_message to record cross-workstream coordination decisions."],
		parameters: teamMessageSchema,
		execute: async (_toolCallId, params, _signal, _onUpdate, ctx) => executeTeamMessage(params, ctx),
	});

	pi.registerTool({
		name: "team_complete",
		label: "Team Complete",
		description: "Close a team run as complete, failed, or cancelled.",
		promptSnippet: "Close team coordination runtime state",
		promptGuidelines: [
			"Use team_complete after integration and verification are complete, or to record failure/cancellation.",
		],
		parameters: teamCompleteSchema,
		execute: async (_toolCallId, params, _signal, _onUpdate, ctx) => executeTeamComplete(params, ctx),
	});

	pi.registerTool({
		name: "ultragoal_create_plan",
		label: "Ultragoal Plan Create",
		description: "Create a Pi-native ultragoal plan from an approved brief.",
		promptSnippet: "Create ultragoal goals from approved brief",
		promptGuidelines: ["Use ultragoal_create_plan before autonomous goal execution if no plan exists."],
		parameters: ultragoalCreatePlanSchema,
		execute: async (_toolCallId, params, _signal, _onUpdate, ctx) => executeUltragoalCreatePlan(params, ctx),
	});

	pi.registerTool({
		name: "ultragoal_status",
		label: "Ultragoal Status",
		description: "Read ultragoal plan status, counts, and current goal.",
		promptSnippet: "Read ultragoal status",
		promptGuidelines: ["Use ultragoal_status before resuming goal-tracked execution."],
		parameters: Type.Object({}),
		execute: async (_toolCallId, params, _signal, _onUpdate, ctx) => executeUltragoalStatus(params, ctx),
	});

	pi.registerTool({
		name: "ultragoal_read_compact",
		label: "Ultragoal Compact State",
		description: "Read compact ultragoal state for continuation.",
		promptSnippet: "Read compact ultragoal state",
		promptGuidelines: ["Use ultragoal_read_compact for prompt-efficient ultragoal continuation."],
		parameters: Type.Object({}),
		execute: async (_toolCallId, params, _signal, _onUpdate, ctx) => executeUltragoalReadCompact(params, ctx),
	});

	pi.registerTool({
		name: "ultragoal_start_next",
		label: "Ultragoal Start Next",
		description: "Mark the next pending ultragoal goal active.",
		promptSnippet: "Start next ultragoal goal",
		promptGuidelines: ["Use ultragoal_start_next before implementing the next goal."],
		parameters: ultragoalStartNextSchema,
		execute: async (_toolCallId, params, _signal, _onUpdate, ctx) => executeUltragoalStartNext(params, ctx),
	});

	pi.registerTool({
		name: "ultragoal_checkpoint",
		label: "Ultragoal Checkpoint",
		description:
			"Checkpoint an ultragoal goal; complete checkpoints require substantive evidence and a passed/verified quality gate.",
		promptSnippet: "Checkpoint ultragoal goal with evidence",
		promptGuidelines: [
			"Use ultragoal_checkpoint after each goal status change; complete only with verified evidence.",
		],
		parameters: ultragoalCheckpointSchema,
		execute: async (_toolCallId, params, _signal, _onUpdate, ctx) => executeUltragoalCheckpoint(params, ctx),
	});
}
