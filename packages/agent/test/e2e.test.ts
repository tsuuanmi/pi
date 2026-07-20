import { execFile } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import {
	type AssistantMessage,
	type FauxProviderRegistration,
	fauxAssistantMessage,
	fauxText,
	fauxThinking,
	fauxToolCall,
	type Model,
	registerFauxProvider,
	type ToolResultMessage,
	type UserMessage,
} from "@tsuuanmi/pi-ai";
import { afterEach, describe, expect, it } from "vitest";
import { Agent, type AgentEvent } from "#agent/index";
import { calculateTool } from "#agent-test/helpers/calculate";

const registrations: FauxProviderRegistration[] = [];
const execFileAsync = promisify(execFile);
const builtPiCliPath = fileURLToPath(new URL("../../pi/dist/cli.js", import.meta.url));

function createFauxRegistration(options: Parameters<typeof registerFauxProvider>[0] = {}): FauxProviderRegistration {
	const registration = registerFauxProvider(options);
	registrations.push(registration);
	return registration;
}

function getTextContent(message: AssistantMessage | ToolResultMessage): string {
	return message.content
		.filter((block) => block.type === "text")
		.map((block) => (block as { text: string }).text)
		.join("\n");
}

async function runBuiltPiWorkflow(
	args: string[],
	cwd: string,
): Promise<{ status: number; stdout: string; stderr: string }> {
	try {
		const result = await execFileAsync(process.execPath, [builtPiCliPath, "workflow", ...args], {
			cwd,
			env: { ...process.env, PI_OFFLINE: "1" },
			maxBuffer: 1024 * 1024,
		});
		return { status: 0, stdout: result.stdout, stderr: result.stderr };
	} catch (error) {
		const failed = error as { code?: unknown; stdout?: unknown; stderr?: unknown };
		return {
			status: typeof failed.code === "number" ? failed.code : 1,
			stdout: typeof failed.stdout === "string" ? failed.stdout : "",
			stderr: typeof failed.stderr === "string" ? failed.stderr : String(error),
		};
	}
}

async function runBuiltPiWorkflowJson<T = { ok?: boolean; body?: unknown }>(args: string[], cwd: string): Promise<T> {
	const result = await runBuiltPiWorkflow([...args, "--json"], cwd);
	expect(result.status, result.stderr || result.stdout).toBe(0);
	return JSON.parse(result.stdout) as T;
}

function cliQualityGate(): Record<string, unknown> {
	return {
		architectReview: {
			architectureStatus: "CLEAR",
			productStatus: "CLEAR",
			codeStatus: "CLEAR",
			recommendation: "APPROVE",
			commands: ["architect review"],
			evidence: "Architecture, product, and code review found no blockers.",
			blockers: [],
		},
		executorQa: {
			status: "passed",
			e2eStatus: "passed",
			redTeamStatus: "passed",
			evidence: "Executor QA covered contracts and adversarial behavior with durable receipts.",
			e2eCommands: ["npm run check"],
			redTeamCommands: ["node -e console.log"],
			artifactRefs: [
				{
					id: "a1",
					kind: "api-package-test-report",
					description: "Ran focused checks",
					verifiedReceipt: { verifiedAt: "2026-06-21T00:00:00.000Z", summary: "checks passed" },
				},
				{
					id: "r1",
					kind: "failure-mode-test-report",
					description: "Ran focused failure-mode checks",
					verifiedReceipt: { verifiedAt: "2026-06-21T00:00:00.000Z", summary: "red-team checks passed" },
				},
			],
			surfaceEvidence: [
				{
					id: "s1",
					surface: "api/package",
					contractRef: "plan#a",
					invocation: "npm run check",
					result: "passed",
					artifactRefs: ["a1"],
				},
			],
			adversarialCases: [
				{
					id: "case-invalid",
					contractRef: "plan#a",
					scenario: "invalid input",
					expectedBehavior: "reject cleanly",
					result: "passed",
					artifactRefs: ["r1"],
				},
			],
			contractCoverage: [
				{
					id: "c1",
					contractRef: "plan#a",
					obligation: "focused checks pass",
					status: "passed",
					surfaceEvidenceRefs: ["s1"],
					adversarialCaseRefs: ["case-invalid"],
				},
			],
			blockers: [],
		},
		iteration: {
			status: "passed",
			fullRerun: true,
			rerunCommands: ["npm run check"],
			evidence: "Final verification reran successfully after the implementation.",
			blockers: [],
		},
	};
}

afterEach(() => {
	while (registrations.length > 0) {
		registrations.pop()?.unregister();
	}
});

async function basicPrompt(model: Model<string>) {
	const agent = new Agent({
		initialState: {
			systemPrompt: "You are a helpful assistant. Keep your responses concise.",
			model,
			thinkingLevel: "off",
			tools: [],
		},
	});

	await agent.prompt("What is 2+2? Answer with just the number.");

	expect(agent.state.isStreaming).toBe(false);
	expect(agent.state.messages.length).toBe(2);
	expect(agent.state.messages[0].role).toBe("user");
	expect(agent.state.messages[1].role).toBe("assistant");

	const assistantMessage = agent.state.messages[1];
	if (assistantMessage.role !== "assistant") throw new Error("Expected assistant message");
	expect(getTextContent(assistantMessage)).toContain("4");
}

async function toolExecution(model: Model<string>) {
	const agent = new Agent({
		initialState: {
			systemPrompt: "You are a helpful assistant. Always use the calculator tool for math.",
			model,
			thinkingLevel: "off",
			tools: [calculateTool],
		},
	});

	const pendingToolCallsDuringEvents: Array<{ type: AgentEvent["type"]; ids: string[] }> = [];
	agent.subscribe((event) => {
		if (event.type === "tool_execution_start" || event.type === "tool_execution_end") {
			pendingToolCallsDuringEvents.push({
				type: event.type,
				ids: [...agent.state.pendingToolCalls],
			});
		}
	});

	await agent.prompt("Calculate 123 * 456 using the calculator tool.");

	expect(agent.state.isStreaming).toBe(false);
	expect(agent.state.messages.length).toBeGreaterThanOrEqual(4);
	const toolResultMsg = agent.state.messages.find((message) => message.role === "toolResult");
	expect(toolResultMsg).toBeDefined();
	if (toolResultMsg?.role !== "toolResult") throw new Error("Expected tool result message");
	expect(getTextContent(toolResultMsg)).toContain("123 * 456 = 56088");

	const finalMessage = agent.state.messages[agent.state.messages.length - 1];
	if (finalMessage.role !== "assistant") throw new Error("Expected final assistant message");
	expect(getTextContent(finalMessage)).toContain("56088");
	expect(agent.state.pendingToolCalls.size).toBe(0);
	expect(pendingToolCallsDuringEvents).toEqual([
		{ type: "tool_execution_start", ids: ["calc-1"] },
		{ type: "tool_execution_end", ids: [] },
	]);
}

async function abortExecution(model: Model<string>) {
	const agent = new Agent({
		initialState: {
			systemPrompt: "You are a helpful assistant.",
			model,
			thinkingLevel: "off",
			tools: [],
		},
	});

	const promptPromise = agent.prompt("Count slowly from 1 to 20.");
	setTimeout(() => {
		agent.abort();
	}, 30);

	await promptPromise;

	expect(agent.state.isStreaming).toBe(false);
	expect(agent.state.messages.length).toBeGreaterThanOrEqual(2);

	const lastMessage = agent.state.messages[agent.state.messages.length - 1];
	if (lastMessage.role !== "assistant") throw new Error("Expected assistant message");
	expect(lastMessage.stopReason).toBe("aborted");
	expect(lastMessage.errorMessage).toBeDefined();
	expect(agent.state.errorMessage).toBe(lastMessage.errorMessage);
}

async function stateUpdates(model: Model<string>) {
	const agent = new Agent({
		initialState: {
			systemPrompt: "You are a helpful assistant.",
			model,
			thinkingLevel: "off",
			tools: [],
		},
	});

	const events: AgentEvent["type"][] = [];
	agent.subscribe((event) => {
		events.push(event.type);
	});

	await agent.prompt("Count from 1 to 5.");

	expect(events).toContain("agent_start");
	expect(events).toContain("turn_start");
	expect(events).toContain("message_start");
	expect(events).toContain("message_update");
	expect(events).toContain("message_end");
	expect(events).toContain("turn_end");
	expect(events).toContain("agent_end");
	expect(events.indexOf("agent_start")).toBeLessThan(events.indexOf("message_start"));
	expect(events.indexOf("message_start")).toBeLessThan(events.indexOf("message_end"));
	expect(events.indexOf("message_end")).toBeLessThan(events.lastIndexOf("agent_end"));

	expect(agent.state.isStreaming).toBe(false);
	expect(agent.state.messages.length).toBe(2);
}

async function multiTurnConversation(model: Model<string>) {
	const agent = new Agent({
		initialState: {
			systemPrompt: "You are a helpful assistant.",
			model,
			thinkingLevel: "off",
			tools: [],
		},
	});

	await agent.prompt("My name is Alice.");
	expect(agent.state.messages.length).toBe(2);

	await agent.prompt("What is my name?");
	expect(agent.state.messages.length).toBe(4);

	const lastMessage = agent.state.messages[3];
	if (lastMessage.role !== "assistant") throw new Error("Expected assistant message");
	expect(getTextContent(lastMessage).toLowerCase()).toContain("alice");
}

describe("Built Pi CLI workflow pipeline", () => {
	it("runs deep-interview to ralplan to ultragoal through pi dist", async () => {
		const cwd = join(tmpdir(), `pi-agent-workflow-cli-${Date.now()}-${Math.random().toString(36).slice(2)}`);
		const sessionId = "agent-e2e-cli";
		await mkdir(cwd, { recursive: true });
		try {
			const initial = await runBuiltPiWorkflowJson<{
				ok?: boolean;
				body?: { statePath?: string; state?: { threshold?: number } };
			}>(["deep-interview", "read-compact", "--input", JSON.stringify({ workspace: cwd, sessionId })], cwd);
			expect(initial.ok).toBe(true);
			expect(initial.body?.state?.threshold).toBe(0.05);
			expect(initial.body?.statePath).toContain(".pi/agent-e2e-cli/workflows/deep-interview/state.json");

			const restate = await runBuiltPiWorkflowJson<{ ok?: boolean; body?: { restated_goal?: string } }>(
				[
					"deep-interview",
					"restate-goal",
					"--input",
					JSON.stringify({
						workspace: cwd,
						sessionId,
						restatedGoal: "Run the bundled CLI workflow pipeline across deep-interview, ralplan, and ultragoal.",
						confirm: "Yes",
					}),
				],
				cwd,
			);
			expect(restate.ok).toBe(true);
			expect(restate.body?.restated_goal).toBeTruthy();

			const spec = await runBuiltPiWorkflowJson<{ ok?: boolean; body?: { path?: string; handoff?: string } }>(
				[
					"deep-interview",
					"write-spec",
					"--input",
					JSON.stringify({
						workspace: cwd,
						sessionId,
						slug: "pipeline-spec",
						spec: "# Deep Interview Spec\n\nApproved CLI pipeline smoke spec.\n",
						handoff: "ralplan",
						allowEarlyExit: true,
					}),
				],
				cwd,
			);
			expect(spec.ok).toBe(true);
			expect(spec.body?.handoff).toBe("ralplan");
			expect(spec.body?.path).toContain(".pi/agent-e2e-cli/specs/deep-interview-pipeline-spec.md");

			const ralplan = await runBuiltPiWorkflowJson<{
				ok?: boolean;
				body?: { pendingApprovalPath?: string; stage?: string };
			}>(
				[
					"ralplan",
					"write-artifact",
					"--input",
					JSON.stringify({
						workspace: cwd,
						sessionId,
						runId: "pipeline-run",
						stage: "final",
						stageN: 1,
						artifact:
							"# Ralplan Final Plan\n\n@goal Verify command pipeline\nRun the bundled CLI workflow pipeline.\n",
					}),
				],
				cwd,
			);
			expect(ralplan.ok).toBe(true);
			expect(ralplan.body?.pendingApprovalPath).toContain(".pi/agent-e2e-cli/plans/ralplan/pipeline-run");

			const approved = await runBuiltPiWorkflowJson<{
				ok?: boolean;
				body?: { ralplanState?: { current_phase?: string }; targetState?: { skill?: string; input?: string } };
			}>(
				[
					"ralplan",
					"approve-plan",
					"--input",
					JSON.stringify({
						workspace: cwd,
						sessionId,
						runId: "pipeline-run",
						target: "ultragoal",
						note: "approved by CLI e2e",
					}),
				],
				cwd,
			);
			expect(approved.ok).toBe(true);
			expect(approved.body?.ralplanState?.current_phase).toBe("handoff");
			expect(approved.body?.targetState?.skill).toBe("ultragoal");
			expect(approved.body?.targetState?.input).toBe(ralplan.body?.pendingApprovalPath);

			const plan = await runBuiltPiWorkflowJson<{ ok?: boolean; body?: { goals?: Array<{ id?: string }> } }>(
				[
					"ultragoal",
					"create-plan",
					"--input",
					JSON.stringify({
						workspace: cwd,
						sessionId,
						brief: "@goal Verify command pipeline\nRun the bundled CLI workflow pipeline and confirm status propagation.",
					}),
				],
				cwd,
			);
			expect(plan.ok).toBe(true);
			expect(plan.body?.goals?.[0]?.id).toBe("G001");

			const started = await runBuiltPiWorkflowJson<{
				ok?: boolean;
				body?: { goal?: { id?: string; status?: string } };
			}>(["ultragoal", "start-next", "--input", JSON.stringify({ workspace: cwd, sessionId })], cwd);
			expect(started.ok).toBe(true);
			expect(started.body?.goal).toMatchObject({ id: "G001", status: "active" });

			const checkpoint = await runBuiltPiWorkflowJson<{
				ok?: boolean;
				body?: { status?: string; completionVerification?: { checkpointLedgerEventId?: string } };
			}>(
				[
					"ultragoal",
					"checkpoint",
					"--input",
					JSON.stringify({
						workspace: cwd,
						sessionId,
						goalId: "G001",
						status: "complete",
						evidence:
							"Ran the bundled CLI workflow pipeline across deep-interview, ralplan, and ultragoal successfully.",
						qualityGate: cliQualityGate(),
					}),
				],
				cwd,
			);
			expect(checkpoint.ok).toBe(true);
			expect(checkpoint.body?.status).toBe("complete");
			expect(checkpoint.body?.completionVerification?.checkpointLedgerEventId).toBeDefined();

			const status = await runBuiltPiWorkflowJson<{
				ok?: boolean;
				body?: { status?: string; counts?: { complete?: number } };
			}>(["ultragoal", "status", "--input", JSON.stringify({ workspace: cwd, sessionId })], cwd);
			expect(status.ok).toBe(true);
			expect(status.body?.status).toBe("complete");
			expect(status.body?.counts?.complete).toBe(1);
		} finally {
			await rm(cwd, { recursive: true, force: true });
		}
	});
});

describe("Agent integration with faux provider", () => {
	it("handles a basic text prompt", async () => {
		const faux = createFauxRegistration();
		faux.setResponses([fauxAssistantMessage("4")]);
		await basicPrompt(faux.getModel());
	});

	it("executes tools and tracks pending tool calls", async () => {
		const faux = createFauxRegistration();
		faux.setResponses([
			fauxAssistantMessage(
				[
					fauxText("Let me calculate that."),
					fauxToolCall("calculate", { expression: "123 * 456" }, { id: "calc-1" }),
				],
				{ stopReason: "toolUse" },
			),
			fauxAssistantMessage("The result is 56088."),
		]);
		await toolExecution(faux.getModel());
	});

	it("handles abort during streaming", async () => {
		const faux = createFauxRegistration({
			tokensPerSecond: 20,
			tokenSize: { min: 2, max: 2 },
		});
		faux.setResponses([
			fauxAssistantMessage(
				"one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen",
			),
		]);
		await abortExecution(faux.getModel());
	});

	it("emits lifecycle updates while streaming", async () => {
		const faux = createFauxRegistration({ tokenSize: { min: 1, max: 1 } });
		faux.setResponses([fauxAssistantMessage("1 2 3 4 5")]);
		await stateUpdates(faux.getModel());
	});

	it("maintains context across multiple turns", async () => {
		const faux = createFauxRegistration();
		faux.setResponses([
			fauxAssistantMessage("Nice to meet you, Alice."),
			(context) => {
				const hasAlice = context.messages.some((message) => {
					if (message.role !== "user") return false;
					if (typeof message.content === "string") return message.content.includes("Alice");
					return message.content.some((block) => block.type === "text" && block.text.includes("Alice"));
				});
				return fauxAssistantMessage(hasAlice ? "Your name is Alice." : "I do not know your name.");
			},
		]);
		await multiTurnConversation(faux.getModel());
	});

	it("preserves thinking content blocks", async () => {
		const faux = createFauxRegistration({ models: [{ id: "faux-reasoning", reasoning: true }] });
		faux.setResponses([fauxAssistantMessage([fauxThinking("step by step"), fauxText("4")])]);

		const agent = new Agent({
			initialState: {
				systemPrompt: "You are a helpful assistant.",
				model: faux.getModel(),
				thinkingLevel: "low",
				tools: [],
			},
		});

		await agent.prompt("What is 2+2?");

		const assistantMessage = agent.state.messages[1];
		if (assistantMessage?.role !== "assistant") throw new Error("Expected assistant message");
		expect(assistantMessage.content).toEqual([
			{ type: "thinking", thinking: "step by step" },
			{ type: "text", text: "4" },
		]);
	});
});

describe("Agent.continue() with faux provider", () => {
	describe("validation", () => {
		it("throws when no messages in context", async () => {
			const faux = createFauxRegistration();
			const agent = new Agent({
				initialState: {
					systemPrompt: "Test",
					model: faux.getModel(),
				},
			});

			await expect(agent.continue()).rejects.toThrow("No messages to continue from");
		});

		it("throws when last message is assistant", async () => {
			const faux = createFauxRegistration();
			const model = faux.getModel();
			const agent = new Agent({
				initialState: {
					systemPrompt: "Test",
					model,
				},
			});

			const assistantMessage: AssistantMessage = {
				role: "assistant",
				content: [{ type: "text", text: "Hello" }],
				api: model.api,
				provider: model.provider,
				model: model.id,
				usage: {
					input: 0,
					output: 0,
					cacheRead: 0,
					cacheWrite: 0,
					totalTokens: 0,
					cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
				},
				stopReason: "stop",
				timestamp: Date.now(),
			};
			agent.state.messages = [assistantMessage];

			await expect(agent.continue()).rejects.toThrow("Cannot continue from message role: assistant");
		});
	});

	describe("continue from user message", () => {
		it("continues and gets a response when last message is user", async () => {
			const faux = createFauxRegistration();
			faux.setResponses([fauxAssistantMessage("HELLO WORLD")]);
			const agent = new Agent({
				initialState: {
					systemPrompt: "You are a helpful assistant. Follow instructions exactly.",
					model: faux.getModel(),
					thinkingLevel: "off",
					tools: [],
				},
			});

			const userMessage: UserMessage = {
				role: "user",
				content: [{ type: "text", text: "Say exactly: HELLO WORLD" }],
				timestamp: Date.now(),
			};
			agent.state.messages = [userMessage];

			await agent.continue();

			expect(agent.state.isStreaming).toBe(false);
			expect(agent.state.messages.length).toBe(2);
			expect(agent.state.messages[0].role).toBe("user");
			expect(agent.state.messages[1].role).toBe("assistant");

			const assistantMsg = agent.state.messages[1];
			if (assistantMsg.role !== "assistant") throw new Error("Expected assistant message");
			expect(getTextContent(assistantMsg).toUpperCase()).toContain("HELLO WORLD");
		});
	});

	describe("continue from tool result", () => {
		it("continues and processes tool results", async () => {
			const faux = createFauxRegistration();
			const model = faux.getModel();
			faux.setResponses([fauxAssistantMessage("The answer is 8.")]);
			const agent = new Agent({
				initialState: {
					systemPrompt:
						"You are a helpful assistant. After getting a calculation result, state the answer clearly.",
					model,
					thinkingLevel: "off",
					tools: [calculateTool],
				},
			});

			const userMessage: UserMessage = {
				role: "user",
				content: [{ type: "text", text: "What is 5 + 3?" }],
				timestamp: Date.now(),
			};

			const assistantMessage: AssistantMessage = {
				role: "assistant",
				content: [
					{ type: "text", text: "Let me calculate that." },
					{ type: "toolCall", id: "calc-1", name: "calculate", arguments: { expression: "5 + 3" } },
				],
				api: model.api,
				provider: model.provider,
				model: model.id,
				usage: {
					input: 0,
					output: 0,
					cacheRead: 0,
					cacheWrite: 0,
					totalTokens: 0,
					cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
				},
				stopReason: "toolUse",
				timestamp: Date.now(),
			};

			const toolResult: ToolResultMessage = {
				role: "toolResult",
				toolCallId: "calc-1",
				toolName: "calculate",
				content: [{ type: "text", text: "5 + 3 = 8" }],
				isError: false,
				timestamp: Date.now(),
			};

			agent.state.messages = [userMessage, assistantMessage, toolResult];

			await agent.continue();

			expect(agent.state.isStreaming).toBe(false);
			expect(agent.state.messages.length).toBeGreaterThanOrEqual(4);

			const lastMessage = agent.state.messages[agent.state.messages.length - 1];
			expect(lastMessage.role).toBe("assistant");
			if (lastMessage.role !== "assistant") throw new Error("Expected assistant message");
			expect(getTextContent(lastMessage)).toContain("8");
		});
	});
});
