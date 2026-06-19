import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { Message } from "@earendil-works/pi-ai";
import type { SubagentManager, SubagentResumeFailureReason, SubagentRunResult } from "../core/subagents.ts";
import type { RalplanStage } from "./paths.ts";
import { workflowStatePath } from "./paths.ts";
import type { RalplanPlannerFallbackReason } from "./ralplan-runtime.ts";
import { writeJsonAtomic } from "./state-writer.ts";
import { activeRalplanRunId, defaultWorkflowId } from "./workflow-state.ts";

export type RalplanAgentRole = "planner" | "architect" | "critic";

export interface RalplanAgentRunInput {
	role: RalplanAgentRole;
	task: string;
	stage: RalplanStage;
	stageN: number;
	runId?: string;
	contextArtifacts?: string[];
	deliberate?: boolean;
	plannerSubagentId?: string;
	attemptResume?: boolean;
	fallbackReason?: RalplanPlannerFallbackReason;
	dryRun?: boolean;
	subagentManager?: Pick<SubagentManager, "spawn" | "resume">;
}

export interface RalplanAgentRunResult {
	agent_run_id: string;
	role: RalplanAgentRole;
	run_id: string;
	stage: RalplanStage;
	stage_n: number;
	status: "planned" | "completed" | "failed";
	exit_code?: number;
	prompt_path?: string;
	record_path: string;
	planner_subagent_id?: string;
	attempted_resume?: boolean;
	fallback_reason?: RalplanPlannerFallbackReason;
	output?: string;
	stderr?: string;
	messages?: Message[];
}

function rolePrompt(role: RalplanAgentRole): string {
	if (role === "planner") {
		return [
			"You are the Pi ralplan Planner agent.",
			"Produce a planning artifact only. Do not edit product files or execute implementation.",
			"Include problem statement, principles, decision drivers, viable options, recommendation, risks, verification plan, and open questions.",
			"Persist the artifact by calling ralplan_write_artifact with the provided runId, stage, stageN, and full markdown artifact.",
			"Return only the receipt/path plus compact planning status. Do not paste the full artifact after persistence.",
		].join("\n");
	}
	if (role === "architect") {
		return [
			"You are the Pi ralplan Architect agent.",
			"Review the planner artifact for architectural soundness. Do not edit product files or execute implementation.",
			"Provide strongest steelman objection, tradeoff tensions, integration/ownership concerns, and synthesis or requested changes.",
			"Persist the review by calling ralplan_write_artifact with the provided runId, stage, stageN, and full markdown artifact.",
			"Return only the receipt/path plus compact verdict: CLEAR, WATCH, or BLOCK; and APPROVE, COMMENT, or REQUEST CHANGES.",
		].join("\n");
	}
	return [
		"You are the Pi ralplan Critic agent.",
		"Evaluate the current plan and architect review against quality criteria. Do not edit product files or execute implementation.",
		"Enforce acceptance criteria quality, risk mitigation clarity, testability, fair alternatives, and concrete verification steps.",
		"Persist the critique by calling ralplan_write_artifact with the provided runId, stage, stageN, and full markdown artifact.",
		"Return only the receipt/path plus compact verdict: APPROVE, ITERATE, or REJECT.",
	].join("\n");
}

function buildTask(input: RalplanAgentRunInput, runId: string): string {
	return [
		`Ralplan role: ${input.role}`,
		`Run id: ${runId}`,
		`Persist stage: ${input.stage}`,
		`Persist stageN: ${input.stageN}`,
		`Deliberate mode: ${input.deliberate === true}`,
		input.plannerSubagentId ? `Persisted Planner id: ${input.plannerSubagentId}` : "Persisted Planner id: none",
		input.attemptResume ? "Planner resume requested: true" : "Planner resume requested: false",
		input.fallbackReason ? `Planner fallback reason: ${input.fallbackReason}` : "Planner fallback reason: none",
		input.contextArtifacts && input.contextArtifacts.length > 0
			? `Context artifacts:\n${input.contextArtifacts.map((item) => `- ${item}`).join("\n")}`
			: "Context artifacts: none",
		"",
		"Task:",
		input.task,
	].join("\n");
}

function getPiInvocation(args: string[]): { command: string; args: string[] } {
	const currentScript = process.argv[1];
	if (currentScript && !currentScript.startsWith("/$bunfs/root/") && basename(currentScript)) {
		return { command: process.execPath, args: [currentScript, ...args] };
	}
	const execName = basename(process.execPath).toLowerCase();
	if (!/^(node|bun)(\.exe)?$/.test(execName)) return { command: process.execPath, args };
	return { command: "pi", args };
}

const RALPLAN_AGENT_TOOLS = [
	"read",
	"bash",
	"ralplan_status",
	"ralplan_read_compact",
	"ralplan_write_artifact",
	"ralplan_doctor",
];

function finalOutput(messages: readonly Message[]): string {
	for (let index = messages.length - 1; index >= 0; index--) {
		const message = messages[index];
		if (message?.role !== "assistant") continue;
		for (const part of message.content) if (part.type === "text") return part.text;
	}
	return "";
}

function ralplanFallbackReason(reason: SubagentResumeFailureReason): RalplanPlannerFallbackReason {
	return reason;
}

function subagentMessages(result: SubagentRunResult): Message[] {
	return result.messages as Message[];
}

async function writeRunRecord(
	cwd: string,
	result: Omit<RalplanAgentRunResult, "record_path">,
): Promise<RalplanAgentRunResult> {
	const recordPath = join(dirname(workflowStatePath(cwd, "ralplan")), "agents", `${result.agent_run_id}.json`);
	const withPath = { ...result, record_path: recordPath };
	await writeJsonAtomic(recordPath, withPath, { cwd });
	return withPath;
}

export async function runRalplanAgent(
	cwd: string,
	input: RalplanAgentRunInput,
	signal?: AbortSignal,
): Promise<RalplanAgentRunResult> {
	if (!Number.isInteger(input.stageN) || input.stageN < 1 || input.stageN > 999)
		throw new Error(`invalid stageN: ${input.stageN}`);
	const runId = input.runId?.trim() || (await activeRalplanRunId(cwd)) || defaultWorkflowId("ralplan");
	const agentRunId = `ralagent-${randomUUID()}`;
	const prompt = rolePrompt(input.role);
	const task = buildTask(input, runId);
	if (input.dryRun === true) {
		return writeRunRecord(cwd, {
			agent_run_id: agentRunId,
			role: input.role,
			run_id: runId,
			stage: input.stage,
			stage_n: input.stageN,
			status: "planned",
			planner_subagent_id: input.plannerSubagentId,
			attempted_resume: input.attemptResume,
			fallback_reason: input.fallbackReason,
			output: task,
		});
	}

	if (input.subagentManager) {
		let subagentResult: SubagentRunResult | undefined;
		let fallbackReason = input.fallbackReason;
		if (input.attemptResume === true && input.plannerSubagentId) {
			const resume = await input.subagentManager.resume(input.plannerSubagentId, task, {
				systemPrompt: prompt,
				tools: RALPLAN_AGENT_TOOLS,
				signal,
			});
			if (resume.ok) subagentResult = resume.result;
			else fallbackReason = ralplanFallbackReason(resume.reason);
		}
		if (!subagentResult) {
			subagentResult = await input.subagentManager.spawn({
				role: `ralplan:${input.role}`,
				label: `ralplan ${input.role} ${input.stage}#${input.stageN}`,
				prompt: task,
				systemPrompt: prompt,
				cwd,
				tools: RALPLAN_AGENT_TOOLS,
				persistent: true,
				signal,
			});
		}
		return writeRunRecord(cwd, {
			agent_run_id: agentRunId,
			role: input.role,
			run_id: runId,
			stage: input.stage,
			stage_n: input.stageN,
			status: subagentResult.record.status === "completed" ? "completed" : "failed",
			planner_subagent_id: subagentResult.record.id,
			attempted_resume: input.attemptResume,
			fallback_reason: fallbackReason,
			output: subagentResult.output,
			stderr: subagentResult.record.error_text,
			messages: subagentMessages(subagentResult),
		});
	}

	const tempDir = await mkdtemp(join(tmpdir(), "pi-ralplan-agent-"));
	const promptPath = join(tempDir, `${input.role}.md`);
	await writeFile(promptPath, prompt, { encoding: "utf8", mode: 0o600 });
	const messages: Message[] = [];
	let stderr = "";
	let wasAborted = false;
	try {
		const args = [
			"--mode",
			"json",
			"-p",
			"--no-session",
			"--append-system-prompt",
			promptPath,
			"--tools",
			"read,grep,find,ls,ralplan_status,ralplan_read_compact,ralplan_write_artifact,ralplan_doctor",
			`Task: ${task}`,
		];
		const exitCode = await new Promise<number>((resolve) => {
			const invocation = getPiInvocation(args);
			const proc = spawn(invocation.command, invocation.args, {
				cwd,
				shell: false,
				stdio: ["ignore", "pipe", "pipe"],
			});
			let buffer = "";
			const processLine = (line: string) => {
				if (!line.trim()) return;
				let event: unknown;
				try {
					event = JSON.parse(line) as unknown;
				} catch {
					return;
				}
				if (!event || typeof event !== "object") return;
				const record = event as Record<string, unknown>;
				if ((record.type === "message_end" || record.type === "tool_result_end") && record.message) {
					messages.push(record.message as Message);
				}
			};
			proc.stdout.on("data", (data: Buffer) => {
				buffer += data.toString();
				const lines = buffer.split("\n");
				buffer = lines.pop() ?? "";
				for (const line of lines) processLine(line);
			});
			proc.stderr.on("data", (data: Buffer) => {
				stderr += data.toString();
			});
			proc.on("close", (code) => {
				if (buffer.trim()) processLine(buffer);
				resolve(code ?? 0);
			});
			proc.on("error", () => resolve(1));
			const abort = () => {
				wasAborted = true;
				proc.kill("SIGTERM");
			};
			if (signal?.aborted) abort();
			else signal?.addEventListener("abort", abort, { once: true });
		});
		return writeRunRecord(cwd, {
			agent_run_id: agentRunId,
			role: input.role,
			run_id: runId,
			stage: input.stage,
			stage_n: input.stageN,
			status: exitCode === 0 && !wasAborted ? "completed" : "failed",
			exit_code: exitCode,
			prompt_path: promptPath,
			planner_subagent_id: input.plannerSubagentId,
			attempted_resume: input.attemptResume,
			fallback_reason: input.fallbackReason,
			output: finalOutput(messages),
			stderr,
			messages,
		});
	} finally {
		await rm(tempDir, { recursive: true, force: true });
	}
}

export function ralplanRoleForStage(stage: RalplanStage): RalplanAgentRole {
	if (stage === "planner" || stage === "revision") return "planner";
	if (stage === "architect") return "architect";
	if (stage === "critic") return "critic";
	throw new Error(`no ralplan role agent for stage: ${stage}`);
}

export type { AgentMessage };
