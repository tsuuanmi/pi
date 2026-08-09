import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import type { RuntimeBackend } from "#agent/backend";
import type { AgentEvent, RuntimeEvent, RuntimeWarning } from "#agent/events";
import type { AgentMessage } from "#agent/messages/state";
import type { RunRequest, RunResult } from "#agent/run";
import type { AgentRuntime } from "#agent/runtime";

export type ProcessRuntimeInputMode = "stdin" | "argument" | "none";

export interface ProcessRuntimeOptions {
	command: string;
	args?: readonly string[];
	cwd?: string;
	env?: NodeJS.ProcessEnv;
	name?: string;
	input?: ProcessRuntimeInputMode;
	systemPrompt?: string;
}

const EMPTY_USAGE = {
	input: 0,
	output: 0,
	cacheRead: 0,
	cacheWrite: 0,
	totalTokens: 0,
	cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};

export class ProcessRuntime implements AgentRuntime {
	private readonly options: ProcessRuntimeOptions;

	constructor(options: ProcessRuntimeOptions) {
		this.options = options;
	}

	async *stream(request: RunRequest): AsyncIterable<RuntimeEvent> {
		const startedAt = Date.now();
		const inputMode = this.options.input ?? "stdin";
		const prompt = buildPrompt(request, this.options.systemPrompt);
		const args = inputMode === "argument" ? [...(this.options.args ?? []), prompt] : [...(this.options.args ?? [])];
		let child: ChildProcessWithoutNullStreams;

		try {
			child = spawn(this.options.command, args, {
				cwd: this.options.cwd,
				env: this.options.env,
				stdio: "pipe",
			});
		} catch (error) {
			yield { type: "error", error };
			return;
		}

		const backend: RuntimeBackend = {
			kind: "process",
			name: this.options.name ?? "process-agent-runtime",
			process: {
				pid: child.pid,
				command: this.options.command,
				args,
				cwd: this.options.cwd,
			},
			details: { input: inputMode, requestKind: request.kind },
		};
		yield { type: "backend", backend };

		for (const event of createPromptEvents(request)) {
			yield { type: "event", event };
		}

		if (inputMode === "stdin") {
			child.stdin.end(prompt);
		} else {
			child.stdin.end();
		}

		const abort = () => child.kill("SIGTERM");
		request.signal.addEventListener("abort", abort, { once: true });

		const stdoutChunks: string[] = [];
		let stdout = "";
		let stderr = "";
		let wake: (() => void) | undefined;
		const notify = () => {
			wake?.();
			wake = undefined;
		};
		const waitForChunk = () =>
			new Promise<void>((resolve) => {
				wake = resolve;
			});

		child.stdout.setEncoding("utf8");
		child.stderr.setEncoding("utf8");
		child.stdout.on("data", (chunk: string) => {
			stdout += chunk;
			stdoutChunks.push(chunk);
			notify();
		});
		child.stderr.on("data", (chunk: string) => {
			stderr += chunk;
		});

		const exit = waitForExit(child);
		try {
			while (true) {
				while (stdoutChunks.length > 0) {
					const chunk = stdoutChunks.shift() ?? "";
					yield {
						type: "trace",
						trace: {
							type: "trace",
							name: "process.stdout",
							timestamp: Date.now(),
							details: { text: chunk },
						},
					};
				}

				const outcome = await Promise.race([
					exit.then((result) => ({ type: "exit" as const, result })),
					waitForChunk().then(() => ({ type: "chunk" as const })),
				]);
				if (outcome.type === "chunk") {
					continue;
				}

				while (stdoutChunks.length > 0) {
					const chunk = stdoutChunks.shift() ?? "";
					yield {
						type: "trace",
						trace: {
							type: "trace",
							name: "process.stdout",
							timestamp: Date.now(),
							details: { text: chunk },
						},
					};
				}

				backend.process = { ...backend.process, exitCode: outcome.result.code, signal: outcome.result.signal };
				if (request.signal.aborted) {
					const message = createAssistantMessage(request, stdout, "aborted", "Process runtime aborted");
					yield* emitAssistantCompletion(message, []);
					yield { type: "done", result: createProcessResult([message], stdout, backend, startedAt, "aborted") };
					return;
				}

				if (outcome.result.code !== 0) {
					const warning = createProcessExitWarning(
						backend.name,
						outcome.result.code,
						outcome.result.signal,
						stderr,
					);
					yield { type: "warning", warning };
					yield { type: "error", error: new Error(warning.message) };
					return;
				}

				const message = createAssistantMessage(request, stdout, "stop");
				yield* emitAssistantCompletion(message, []);
				yield { type: "done", result: createProcessResult([message], stdout, backend, startedAt, "completed") };
				return;
			}
		} finally {
			request.signal.removeEventListener("abort", abort);
			if (child.exitCode === null && child.signalCode === null) {
				child.kill("SIGTERM");
			}
		}
	}
}

function buildPrompt(request: RunRequest, systemPrompt?: string): string {
	const messages =
		request.kind === "prompt" ? [...request.context.messages, ...request.messages] : request.context.messages;
	const parts = [systemPrompt ?? request.context.systemPrompt]
		.filter((part) => part.length > 0)
		.concat(messages.map(messageToText).filter((part) => part.length > 0));
	return parts.join("\n\n");
}

function messageToText(message: AgentMessage): string {
	const content = (message as { content?: unknown }).content;
	if (typeof content === "string") {
		return content;
	}
	if (Array.isArray(content)) {
		return content
			.filter((item: { type?: string; text?: string }) => item.type === "text")
			.map((item: { text?: string }) => item.text ?? "")
			.join("\n");
	}
	return "";
}

function* createPromptEvents(request: RunRequest): Iterable<AgentEvent> {
	yield { type: "agent_start" };
	yield { type: "turn_start" };
	if (request.kind !== "prompt") {
		return;
	}
	for (const message of request.messages) {
		yield { type: "message_start", message };
		yield { type: "message_end", message };
	}
}

function createAssistantMessage(
	request: RunRequest,
	output: string,
	stopReason: "stop" | "aborted" | "error",
	errorMessage?: string,
): AgentMessage {
	return {
		role: "assistant",
		content: [{ type: "text", text: output }],
		api: request.config.model.api,
		provider: request.config.model.provider,
		model: request.config.model.id,
		usage: EMPTY_USAGE,
		stopReason,
		...(errorMessage ? { errorMessage } : {}),
		timestamp: Date.now(),
	};
}

function* emitAssistantCompletion(message: AgentMessage, toolResults: []): Iterable<RuntimeEvent> {
	yield { type: "event", event: { type: "message_start", message } };
	yield { type: "event", event: { type: "message_end", message } };
	yield { type: "event", event: { type: "turn_end", message, toolResults } };
	yield { type: "event", event: { type: "agent_end", messages: [message] } };
}

function createProcessResult(
	messages: AgentMessage[],
	output: string,
	backend: RuntimeBackend,
	startedAt: number,
	status: "completed" | "aborted" | "failed",
): RunResult {
	const completedAt = Date.now();
	return {
		messages,
		output,
		turns: messages.filter((message) => message.role === "assistant").length,
		backend,
		toolCalls: [],
		warnings: [],
		traces: [],
		loopDetected: false,
		maxTurnsReached: false,
		status,
		startedAt,
		completedAt,
		durationMs: completedAt - startedAt,
	};
}

function createProcessExitWarning(
	name: string,
	code: number | null,
	signal: string | null,
	stderr: string,
): RuntimeWarning {
	return {
		code: "PROCESS_EXIT_NON_ZERO",
		message: `Process runtime ${name} exited with code ${code ?? "null"}${signal ? ` and signal ${signal}` : ""}`,
		details: { code, signal, stderr },
	};
}

function waitForExit(child: ChildProcessWithoutNullStreams): Promise<{ code: number | null; signal: string | null }> {
	return new Promise((resolve, reject) => {
		child.once("error", reject);
		child.once("exit", (code, signal) => resolve({ code, signal }));
	});
}
