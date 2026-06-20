import { readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ExtensionAPI, ExtensionContext } from "../src/core/extensions/types.ts";
import workflowsExtension from "../src/extensions/workflows.ts";
import { formatWorkflowHudLine, readWorkflowActiveState } from "../src/workflows/active-state.ts";
import {
	appendOrMergeDeepInterviewRound,
	enrichDeepInterviewRoundScoring,
	finalizeDeepInterviewSpecState,
	planDeepInterviewQuestion,
	readDeepInterviewStateCompact,
} from "../src/workflows/deep-interview-runtime.ts";
import { normalizeDeepInterviewEnvelope } from "../src/workflows/deep-interview-state.ts";
import { readWorkflowState, writeWorkflowState } from "../src/workflows/workflow-state.ts";

interface CapturedTool {
	name: string;
	execute(
		toolCallId: string,
		params: unknown,
		signal: AbortSignal | undefined,
		onUpdate: unknown,
		ctx: ExtensionContext,
	): Promise<unknown>;
}

function createWorkflowToolHarness(cwd: string): {
	tool(name: string): CapturedTool;
	ctx: ExtensionContext;
	messages: string[];
} {
	const tools = new Map<string, CapturedTool>();
	const messages: string[] = [];
	const api = {
		registerTool(tool: CapturedTool): void {
			tools.set(tool.name, tool);
		},
		registerCommand(): void {},
		on(): void {},
		sendUserMessage(content: string): void {
			messages.push(content);
		},
	} as unknown as ExtensionAPI;
	workflowsExtension(api);
	const ctx = {
		cwd,
		mode: "json",
		hasUI: false,
		sessionManager: { getSessionId: () => "test-session-id" },
	} as unknown as ExtensionContext;
	return {
		tool(name: string): CapturedTool {
			const found = tools.get(name);
			if (!found) throw new Error(`tool not registered: ${name}`);
			return found;
		},
		ctx,
		messages,
	};
}

describe("deep-interview workflow runtime", () => {
	let cwd: string;

	beforeEach(() => {
		cwd = join(tmpdir(), `pi-deep-interview-${Date.now()}-${Math.random().toString(36).slice(2)}`);
	});

	afterEach(async () => {
		await rm(cwd, { recursive: true, force: true });
	});

	it("normalizes legacy flattened state into canonical nested state", () => {
		const normalized = normalizeDeepInterviewEnvelope({
			active: true,
			rounds: [{ round: 1 }],
			established_facts: [{ id: "F1" }],
			threshold: 0.5,
		});

		expect(normalized.rounds).toBeUndefined();
		expect(normalized.state?.rounds as unknown[]).toHaveLength(1);
		expect(normalized.state?.established_facts as unknown[]).toHaveLength(1);
		expect(normalized.state?.threshold).toBe(0.5);
	});

	it("records, deduplicates, and replaces answer shells", async () => {
		await writeWorkflowState(cwd, "deep-interview", {
			current_phase: "interviewing",
			state: { interview_id: "interview-1", rounds: [], established_facts: [] },
		});

		const first = await appendOrMergeDeepInterviewRound(cwd, {
			round: 1,
			questionId: "q1",
			questionText: "What is the goal?",
			customInput: "Ship it",
		});
		const duplicate = await appendOrMergeDeepInterviewRound(cwd, {
			round: 1,
			questionId: "q1",
			questionText: "What is the goal?",
			customInput: "Ship it",
		});
		const replacement = await appendOrMergeDeepInterviewRound(cwd, {
			round: 1,
			questionId: "q1",
			questionText: "What is the goal?",
			customInput: "Ship v1",
		});

		expect(first.action).toBe("created");
		expect(duplicate.action).toBe("noop");
		expect(replacement.action).toBe("replaced");
		const state = await readWorkflowState(cwd, "deep-interview");
		const rounds = (state?.state as { rounds?: Array<{ custom_input?: string }> }).rounds ?? [];
		expect(rounds).toHaveLength(1);
		expect(rounds[0].custom_input).toBe("Ship v1");
		const active = await readWorkflowActiveState(cwd);
		const deepInterview = active?.active_workflows.find((entry) => entry.skill === "deep-interview");
		expect(deepInterview?.phase).toBe("interviewing");
		expect(deepInterview ? formatWorkflowHudLine(deepInterview) : "").toContain("deep-interview");
	});

	it("plans a question and records the next answer against pending orchestration", async () => {
		await planDeepInterviewQuestion(cwd, {
			round: 1,
			questionId: "q1",
			questionText: "What outcome matters most?",
			component: "goal",
			dimension: "goal",
			ambiguity: 0.9,
			rationale: "goal is weakest",
		});

		await appendOrMergeDeepInterviewRound(cwd, { customInput: "Fast feedback" });
		let state = await readWorkflowState(cwd, "deep-interview");
		const answeredOrchestration = (
			state?.state as { orchestration?: { status?: string; last_answered_question_id?: string } }
		).orchestration;
		expect(answeredOrchestration?.status).toBe("pending_scoring");
		expect(answeredOrchestration?.last_answered_question_id).toBe("q1");
		expect(((state?.state as { rounds?: Array<{ question_text?: string }> }).rounds ?? [])[0].question_text).toBe(
			"What outcome matters most?",
		);

		await enrichDeepInterviewRoundScoring(cwd, {
			round: 1,
			questionId: "q1",
			scores: { goal: 0.7 },
			ambiguity: 0.3,
		});
		state = await readWorkflowState(cwd, "deep-interview");
		const scoredOrchestration = (
			state?.state as { orchestration?: { status?: string; last_scored_question_id?: string } }
		).orchestration;
		expect(scoredOrchestration?.status).toBe("interviewing");
		expect(scoredOrchestration?.last_scored_question_id).toBe("q1");
	});

	it("deep_interview_plan_question tool persists waiting state", async () => {
		const harness = createWorkflowToolHarness(cwd);
		await harness
			.tool("deep_interview_plan_question")
			.execute(
				"tool-1",
				{ round: 2, questionId: "q2", questionText: "Which constraint is fixed?", dimension: "constraints" },
				undefined,
				undefined,
				harness.ctx,
			);

		const state = await readWorkflowState(cwd, "deep-interview");
		const orchestration = (
			state?.state as { orchestration?: { status?: string; next_question?: { question_id?: string } } }
		).orchestration;
		expect(orchestration?.status).toBe("waiting_for_answer");
		expect(orchestration?.next_question?.question_id).toBe("q2");
	});

	it("rejects invalid ambiguity-raising trigger transitions", async () => {
		await appendOrMergeDeepInterviewRound(cwd, {
			round: 1,
			questionId: "q1",
			questionText: "Goal?",
			customInput: "A",
		});
		await enrichDeepInterviewRoundScoring(cwd, {
			round: 1,
			questionId: "q1",
			scores: { goal: 0.6 },
			ambiguity: 0.4,
		});
		await appendOrMergeDeepInterviewRound(cwd, {
			round: 2,
			questionId: "q2",
			questionText: "Constraint?",
			customInput: "B",
		});

		await expect(
			enrichDeepInterviewRoundScoring(cwd, {
				round: 2,
				questionId: "q2",
				scores: { goal: 0.8 },
				ambiguity: 0.3,
				triggers: [
					{
						kind: "A",
						name: "contradiction",
						status: "active",
						component: "core",
						dimension: "goal",
					},
				],
			}),
		).rejects.toThrow(/invalid/);
	});

	it("finalizes spec metadata without reintroducing flattened transcript state", async () => {
		await writeWorkflowState(cwd, "deep-interview", {
			active: true,
			current_phase: "interviewing",
			rounds: [{ round: 1, round_key: "legacy", lifecycle: "answered" }],
			state: { interview_id: "interview-1", established_facts: [{ id: "F1" }] },
		});

		await finalizeDeepInterviewSpecState(cwd, {
			slug: "final",
			path: join(cwd, ".pi", "specs", "deep-interview-final.md"),
			sha256: "abc",
			handoff: "stop",
		});

		const state = await readWorkflowState(cwd, "deep-interview");
		expect(state?.rounds).toBeUndefined();
		expect(state?.active).toBe(false);
		expect(state?.current_phase).toBe("complete");
		expect(state?.spec_slug).toBe("final");
		const nested = state?.state as { rounds?: unknown[]; established_facts?: unknown[] } | undefined;
		expect(nested?.rounds).toHaveLength(1);
		expect(nested?.established_facts).toHaveLength(1);
		expect(
			(await readWorkflowActiveState(cwd, { sessionId: "test-session-id" }))?.active_workflows.some(
				(entry) => entry.skill === "deep-interview",
			),
		).toBe(false);
	});

	it("deep_interview_write_spec writes spec and seeds ralplan handoff", async () => {
		await appendOrMergeDeepInterviewRound(cwd, {
			round: 1,
			questionId: "q1",
			questionText: "Goal?",
			customInput: "A",
		});
		const harness = createWorkflowToolHarness(cwd);
		await harness
			.tool("deep_interview_write_spec")
			.execute(
				"tool-1",
				{ slug: "handoff", spec: "# Final spec", handoff: "ralplan" },
				undefined,
				undefined,
				harness.ctx,
			);

		const deepState = await readWorkflowState(cwd, "deep-interview");
		const specPath = deepState?.spec_path;
		expect(typeof specPath).toBe("string");
		expect(deepState?.current_phase).toBe("handoff");
		expect(deepState?.rounds).toBeUndefined();
		expect((deepState?.state as { rounds?: unknown[] }).rounds ?? []).toHaveLength(1);
		expect(await readFile(specPath as string, "utf8")).toBe("# Final spec\n");

		const ralplanState = await readWorkflowState(cwd, "ralplan");
		expect(ralplanState?.active).toBe(true);
		expect(ralplanState?.current_phase).toBe("planner");
		expect(ralplanState?.input).toBe(specPath);
		const active = await readWorkflowActiveState(cwd, { sessionId: "test-session-id" });
		expect(active?.active_workflows.some((entry) => entry.skill === "deep-interview")).toBe(false);
		expect(active?.active_workflows.some((entry) => entry.skill === "ralplan")).toBe(true);
	});

	it("deep_interview_write_spec rejects unknown handoff targets", async () => {
		const harness = createWorkflowToolHarness(cwd);
		await expect(
			harness
				.tool("deep_interview_write_spec")
				.execute(
					"tool-1",
					{ slug: "bad", spec: "# Final spec", handoff: "unknown" },
					undefined,
					undefined,
					harness.ctx,
				),
		).rejects.toThrow(/unknown handoff/);
	});

	it("deep_interview_write_spec seeds direct execution handoffs", async () => {
		const harness = createWorkflowToolHarness(cwd);
		await harness
			.tool("deep_interview_write_spec")
			.execute("tool-1", { slug: "team", spec: "# Team spec", handoff: "team" }, undefined, undefined, harness.ctx);

		const deepState = await readWorkflowState(cwd, "deep-interview");
		const teamState = await readWorkflowState(cwd, "team");
		expect(teamState?.active).toBe(true);
		expect(teamState?.current_phase).toBe("approved-execution");
		expect(teamState?.input).toBe(deepState?.spec_path);
	});

	it("returns compact state projection", async () => {
		await appendOrMergeDeepInterviewRound(cwd, {
			round: 1,
			questionId: "q1",
			questionText: "Goal?",
			customInput: "A",
		});
		await enrichDeepInterviewRoundScoring(cwd, {
			round: 1,
			questionId: "q1",
			scores: { goal: 0.6 },
			ambiguity: 0.4,
		});
		await appendOrMergeDeepInterviewRound(cwd, {
			round: 2,
			questionId: "q2",
			questionText: "Criteria?",
			customInput: "pending",
		});

		const compact = await readDeepInterviewStateCompact(cwd, 1);
		expect(compact.state.current_ambiguity).toBe(0.4);
		expect(compact.state.orchestration?.status).toBe("pending_scoring");
		expect(compact.state.recent_scored_rounds).toHaveLength(1);
		expect(compact.state.pending_shells).toHaveLength(1);
	});
});
