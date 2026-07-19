import { readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI } from "@tsuuanmi/pi-coding-agent";
import workflowsExtension, {
	appendOrMergeDeepInterviewRound,
	assertDeepInterviewHandoff,
	assertDeepInterviewSpecReady,
	deepInterviewSpecPath,
	enrichDeepInterviewRoundScoring,
	finalizeDeepInterviewSpecState,
	formatWorkflowHudLine,
	getDeepInterviewMutationDecision,
	handoffWorkflow,
	normalizeDeepInterviewEnvelope,
	planDeepInterviewQuestion,
	readDeepInterviewStateCompact,
	readWorkflowActiveState,
	readWorkflowState,
	runClosureAcceptanceGuard,
	syncWorkflowActiveState,
	writeTextArtifact,
	writeWorkflowState,
} from "@tsuuanmi/pi-workflows";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const TEST_SESSION = "test-session-id";

function collectRegisteredToolNames(): string[] {
	const tools: string[] = [];
	const api = {
		registerTool(tool: { name: string }): void {
			tools.push(tool.name);
		},
		registerCommand(): void {},
		on(): void {},
		sendUserMessage(): void {},
	} as unknown as ExtensionAPI;
	workflowsExtension(api);
	return tools;
}

async function writeDeepInterviewSpecAndHandoff(
	cwd: string,
	input: { slug: string; spec: string; handoff?: "ralplan" | "ultragoal" | "team" | "stop" },
): Promise<string> {
	const specPath = deepInterviewSpecPath(cwd, input.slug, TEST_SESSION);
	const existing = await readWorkflowState(cwd, "deep-interview", { sessionId: TEST_SESSION });
	if (!existing?.active) {
		await writeWorkflowState(
			cwd,
			"deep-interview",
			{ active: true, current_phase: "interviewing", state: { rounds: [], established_facts: [] } },
			"pi test",
			{ sessionId: TEST_SESSION },
		);
	}
	const artifact = await writeTextArtifact(specPath, `${input.spec}\n`, { cwd });
	if (input.handoff && input.handoff !== "stop") {
		await handoffWorkflow({
			cwd,
			sessionId: TEST_SESSION,
			command: "pi workflow finalize deep-interview",
			caller: {
				skill: "deep-interview",
				patch: { active: false, current_phase: "handoff", spec_path: artifact.path, spec_sha256: artifact.sha256 },
			},
			callee: {
				skill: input.handoff,
				patch: {
					active: true,
					current_phase: input.handoff === "ralplan" ? "planner" : "approved-execution",
					input: artifact.path,
				},
			},
		});
		return artifact.path;
	}
	await finalizeDeepInterviewSpecState(
		cwd,
		{ slug: input.slug, path: artifact.path, sha256: artifact.sha256, handoff: input.handoff },
		TEST_SESSION,
	);
	return artifact.path;
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
		await writeWorkflowState(
			cwd,
			"deep-interview",
			{
				current_phase: "interviewing",
				state: { interview_id: "interview-1", rounds: [], established_facts: [] },
			},
			"pi test",
			{ sessionId: TEST_SESSION },
		);

		const first = await appendOrMergeDeepInterviewRound(
			cwd,
			{
				round: 1,
				questionId: "q1",
				questionText: "What is the goal?",
				customInput: "Ship it",
			},
			TEST_SESSION,
		);
		const duplicate = await appendOrMergeDeepInterviewRound(
			cwd,
			{
				round: 1,
				questionId: "q1",
				questionText: "What is the goal?",
				customInput: "Ship it",
			},
			TEST_SESSION,
		);
		const replacement = await appendOrMergeDeepInterviewRound(
			cwd,
			{
				round: 1,
				questionId: "q1",
				questionText: "What is the goal?",
				customInput: "Ship v1",
			},
			TEST_SESSION,
		);

		expect(first.action).toBe("created");
		expect(duplicate.action).toBe("noop");
		expect(replacement.action).toBe("replaced");
		const state = await readWorkflowState(cwd, "deep-interview", { sessionId: TEST_SESSION });
		const rounds = (state?.state as { rounds?: Array<{ custom_input?: string }> }).rounds ?? [];
		expect(rounds).toHaveLength(1);
		expect(rounds[0].custom_input).toBe("Ship v1");
		const active = await readWorkflowActiveState(cwd, { sessionId: TEST_SESSION });
		const deepInterview = active?.active_workflows.find((entry) => entry.skill === "deep-interview");
		expect(deepInterview?.phase).toBe("interviewing");
		expect(deepInterview ? formatWorkflowHudLine(deepInterview) : "").toContain("deep-interview");
	});

	it("plans a question and records the next answer against pending orchestration", async () => {
		await planDeepInterviewQuestion(
			cwd,
			{
				round: 1,
				questionId: "q1",
				questionText: "What outcome matters most?",
				component: "goal",
				dimension: "goal",
				ambiguity: 0.9,
				rationale: "goal is weakest",
			},
			TEST_SESSION,
		);

		await appendOrMergeDeepInterviewRound(cwd, { customInput: "Fast feedback" }, TEST_SESSION);
		let state = await readWorkflowState(cwd, "deep-interview", { sessionId: TEST_SESSION });
		const answeredOrchestration = (
			state?.state as { orchestration?: { status?: string; last_answered_question_id?: string } }
		).orchestration;
		expect(answeredOrchestration?.status).toBe("pending_scoring");
		expect(answeredOrchestration?.last_answered_question_id).toBe("q1");
		expect(((state?.state as { rounds?: Array<{ question_text?: string }> }).rounds ?? [])[0].question_text).toBe(
			"What outcome matters most?",
		);

		await enrichDeepInterviewRoundScoring(
			cwd,
			{
				round: 1,
				questionId: "q1",
				scores: { goal: 0.7 },
				ambiguity: 0.3,
			},
			TEST_SESSION,
		);
		state = await readWorkflowState(cwd, "deep-interview", { sessionId: TEST_SESSION });
		const scoredOrchestration = (
			state?.state as { orchestration?: { status?: string; last_scored_question_id?: string } }
		).orchestration;
		expect(scoredOrchestration?.status).toBe("interviewing");
		expect(scoredOrchestration?.last_scored_question_id).toBe("q1");
	});

	it("extension registers deep-interview tools while runtime planning persists waiting state", async () => {
		expect(collectRegisteredToolNames()).toEqual(
			expect.arrayContaining(["deep_interview_plan_question", "deep_interview_write_spec"]),
		);
		await planDeepInterviewQuestion(
			cwd,
			{ round: 2, questionId: "q2", questionText: "Which constraint is fixed?", dimension: "constraints" },
			TEST_SESSION,
		);

		const state = await readWorkflowState(cwd, "deep-interview", { sessionId: TEST_SESSION });
		const orchestration = (
			state?.state as { orchestration?: { status?: string; next_question?: { question_id?: string } } }
		).orchestration;
		expect(orchestration?.status).toBe("waiting_for_answer");
		expect(orchestration?.next_question?.question_id).toBe("q2");
	});

	it("rejects invalid ambiguity-raising trigger transitions", async () => {
		await appendOrMergeDeepInterviewRound(
			cwd,
			{
				round: 1,
				questionId: "q1",
				questionText: "Goal?",
				customInput: "A",
			},
			TEST_SESSION,
		);
		await enrichDeepInterviewRoundScoring(
			cwd,
			{
				round: 1,
				questionId: "q1",
				scores: { goal: 0.6 },
				ambiguity: 0.4,
			},
			TEST_SESSION,
		);
		await appendOrMergeDeepInterviewRound(
			cwd,
			{
				round: 2,
				questionId: "q2",
				questionText: "Constraint?",
				customInput: "B",
			},
			TEST_SESSION,
		);

		await expect(
			enrichDeepInterviewRoundScoring(
				cwd,
				{
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
				},
				TEST_SESSION,
			),
		).rejects.toThrow(/invalid/);
	});

	it("finalizes spec metadata without reintroducing flattened transcript state", async () => {
		await writeWorkflowState(
			cwd,
			"deep-interview",
			{
				active: true,
				current_phase: "interviewing",
				rounds: [{ round: 1, round_key: "legacy", lifecycle: "answered" }],
				state: { interview_id: "interview-1", established_facts: [{ id: "F1" }] },
			},
			"pi test",
			{ sessionId: TEST_SESSION },
		);

		await finalizeDeepInterviewSpecState(
			cwd,
			{
				slug: "final",
				path: join(cwd, ".pi", "specs", "deep-interview-final.md"),
				sha256: "abc",
				handoff: "stop",
			},
			TEST_SESSION,
		);

		const state = await readWorkflowState(cwd, "deep-interview", { sessionId: TEST_SESSION });
		expect(state?.rounds).toBeUndefined();
		expect(state?.active).toBe(false);
		expect(state?.current_phase).toBe("complete");
		expect(state?.spec_slug).toBe("final");
		const nested = state?.state as { rounds?: unknown[]; established_facts?: unknown[] } | undefined;
		expect(nested?.rounds).toHaveLength(1);
		expect(nested?.established_facts).toHaveLength(1);
		expect(
			(await readWorkflowActiveState(cwd, { sessionId: TEST_SESSION }))?.active_workflows.some(
				(entry) => entry.skill === "deep-interview",
			),
		).toBe(false);
	});

	it("runtime spec finalization writes spec and seeds ralplan handoff", async () => {
		await appendOrMergeDeepInterviewRound(
			cwd,
			{
				round: 1,
				questionId: "q1",
				questionText: "Goal?",
				customInput: "A",
			},
			TEST_SESSION,
		);
		const writtenSpecPath = await writeDeepInterviewSpecAndHandoff(cwd, {
			slug: "handoff",
			spec: "# Final spec",
			handoff: "ralplan",
		});

		const deepState = await readWorkflowState(cwd, "deep-interview", { sessionId: TEST_SESSION });
		const specPath = deepState?.spec_path;
		expect(typeof specPath).toBe("string");
		expect(deepState?.current_phase).toBe("handoff");
		expect(deepState?.rounds).toBeUndefined();
		expect((deepState?.state as { rounds?: unknown[] }).rounds ?? []).toHaveLength(1);
		expect(specPath).toBe(writtenSpecPath);
		expect(await readFile(specPath as string, "utf8")).toBe("# Final spec\n");

		const ralplanState = await readWorkflowState(cwd, "ralplan", { sessionId: TEST_SESSION });
		expect(ralplanState?.active).toBe(true);
		expect(ralplanState?.current_phase).toBe("planner");
		expect(ralplanState?.input).toBe(specPath);
		const active = await readWorkflowActiveState(cwd, { sessionId: TEST_SESSION });
		expect(active?.active_workflows.some((entry) => entry.skill === "deep-interview")).toBe(false);
		expect(active?.active_workflows.some((entry) => entry.skill === "ralplan")).toBe(true);
	});

	it("deep-interview handoff validation rejects unknown handoff targets", () => {
		expect(() => assertDeepInterviewHandoff("unknown")).toThrow(/unknown handoff/);
	});

	it("spec readiness requires closure, restatement, and below-threshold ambiguity", async () => {
		await writeWorkflowState(
			cwd,
			"deep-interview",
			{
				active: true,
				current_phase: "interviewing",
				threshold: 0.05,
				restated_goal: "Ship a safe workflow runtime.",
				state: {
					type: "greenfield",
					topology: { components: [{ id: "core", name: "Core", status: "active" }] },
					rounds: [
						{
							round_key: "r1",
							round: 1,
							question_hash: "q",
							answer_hash: "a",
							lifecycle: "scored",
							answered_at: "now",
							component: "core",
							scores: { goal: 0.98, constraints: 0.98, criteria: 0.98 },
							ambiguity: 0.02,
						},
					],
					established_facts: [],
				},
			},
			"pi test",
			{ sessionId: TEST_SESSION },
		);

		await expect(assertDeepInterviewSpecReady(cwd, TEST_SESSION)).resolves.toBeUndefined();
	});

	it("closure rejects below-floor scored coverage", () => {
		const closure = normalizeDeepInterviewEnvelope({
			restated_goal: "Ship a safe workflow runtime.",
			threshold: 0.05,
			state: {
				type: "greenfield",
				topology: { components: [{ id: "core", name: "Core", status: "active" }] },
				rounds: [
					{
						round_key: "r1",
						round: 1,
						question_hash: "q",
						answer_hash: "a",
						lifecycle: "scored",
						answered_at: "now",
						component: "core",
						scores: { goal: 0.7, constraints: 0.8, criteria: 0.8 },
						ambiguity: 0.1,
					},
				],
				established_facts: [],
			},
		});

		expect(runClosureAcceptanceGuard(closure).ok).toBe(false);
		expect(runClosureAcceptanceGuard(closure).gaps[0]).toContain(">= 0.75");
	});

	it("blocks mutating bash commands during active deep-interview", async () => {
		await writeWorkflowState(
			cwd,
			"deep-interview",
			{ active: true, current_phase: "interviewing", state: { rounds: [], established_facts: [] } },
			"pi test",
			{ sessionId: TEST_SESSION },
		);
		await syncWorkflowActiveState(
			cwd,
			{ skill: "deep-interview", active: true, phase: "interviewing" },
			{ sessionId: TEST_SESSION },
		);

		const readOnly = await getDeepInterviewMutationDecision({
			cwd,
			sessionId: TEST_SESSION,
			toolName: "bash",
			input: { command: "rg -n TODO packages/workflows/src" },
		});
		const mutating = await getDeepInterviewMutationDecision({
			cwd,
			sessionId: TEST_SESSION,
			toolName: "bash",
			input: { command: "echo changed > packages/workflows/src/file.ts" },
		});

		expect(readOnly.blocked).toBe(false);
		expect(mutating.blocked).toBe(true);
	});

	it("runtime spec finalization seeds direct execution handoffs", async () => {
		await writeDeepInterviewSpecAndHandoff(cwd, { slug: "team", spec: "# Team spec", handoff: "team" });

		const deepState = await readWorkflowState(cwd, "deep-interview", { sessionId: TEST_SESSION });
		const teamState = await readWorkflowState(cwd, "team", { sessionId: TEST_SESSION });
		expect(teamState?.active).toBe(true);
		expect(teamState?.current_phase).toBe("approved-execution");
		expect(teamState?.input).toBe(deepState?.spec_path);
	});

	it("returns compact state projection", async () => {
		await appendOrMergeDeepInterviewRound(
			cwd,
			{
				round: 1,
				questionId: "q1",
				questionText: "Goal?",
				customInput: "A",
			},
			TEST_SESSION,
		);
		await enrichDeepInterviewRoundScoring(
			cwd,
			{
				round: 1,
				questionId: "q1",
				scores: { goal: 0.6 },
				ambiguity: 0.4,
			},
			TEST_SESSION,
		);
		await appendOrMergeDeepInterviewRound(
			cwd,
			{
				round: 2,
				questionId: "q2",
				questionText: "Criteria?",
				customInput: "pending",
			},
			TEST_SESSION,
		);

		const compact = await readDeepInterviewStateCompact(cwd, TEST_SESSION, 1);
		expect(compact.state.current_ambiguity).toBe(0.4);
		expect(compact.state.orchestration?.status).toBe("pending_scoring");
		expect(compact.state.recent_scored_rounds).toHaveLength(1);
		expect(compact.state.pending_shells).toHaveLength(1);
	});
});
