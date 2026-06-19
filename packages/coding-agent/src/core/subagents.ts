import { createHash, randomBytes, randomUUID } from "node:crypto";
import { appendFile, mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { AssistantMessage } from "@earendil-works/pi-ai";
import type { AgentSession } from "./agent-session.ts";
import { type AgentSessionServices, createAgentSessionFromServices } from "./agent-session-services.ts";
import type { ExtensionUIContext } from "./extensions/types.ts";
import { SessionManager } from "./session-manager.ts";
import { withFileMutationQueue } from "./tools/file-mutation-queue.ts";

export type SubagentStatus = "queued" | "running" | "paused" | "completed" | "failed" | "cancelled";
export type SubagentResumeFailureReason = "context_unavailable" | "not_found" | "no_runner" | "resume_failed";
export type SubagentDelivery = "steer" | "followUp";

export interface SubagentRunRequest {
	role: string;
	prompt: string;
	systemPrompt?: string;
	cwd?: string;
	tools?: string[];
	model?: string;
	persistent?: boolean;
	detached?: boolean;
	label?: string;
	parentSessionId?: string;
	signal?: AbortSignal;
	resumeSessionFile?: string;
}

export interface SubagentRecord {
	id: string;
	role: string;
	label?: string;
	status: SubagentStatus;
	cwd: string;
	session_id?: string;
	session_file?: string;
	parent_session_id?: string;
	resumable: boolean;
	created_at: string;
	updated_at: string;
	started_at?: string;
	completed_at?: string;
	last_prompt_sha256?: string;
	result_text?: string;
	error_text?: string;
}

export interface SubagentRunResult {
	record: SubagentRecord;
	messages: AgentMessage[];
	output: string;
}

export interface SubagentAwaitOptions {
	timeoutMs?: number;
}

export type SubagentAwaitResult =
	| { ok: true; result: SubagentRunResult; timedOut?: false }
	| { ok: false; reason: "not_found" | "timeout"; record?: SubagentRecord; timedOut?: true };

export type SubagentResumeResult =
	| { ok: true; result: SubagentRunResult }
	| { ok: false; reason: SubagentResumeFailureReason; record?: SubagentRecord };

interface LiveSubagent {
	controller: AbortController;
	promise: Promise<SubagentRunResult>;
	session?: AgentSession;
	pauseRequested: boolean;
}

function nowIso(): string {
	return new Date().toISOString();
}

function hashText(value: string): string {
	return createHash("sha256").update(value).digest("hex");
}

function defaultSubagentId(): string {
	const date = new Date();
	const yyyy = date.getUTCFullYear().toString().padStart(4, "0");
	const mm = (date.getUTCMonth() + 1).toString().padStart(2, "0");
	const dd = date.getUTCDate().toString().padStart(2, "0");
	const hh = date.getUTCHours().toString().padStart(2, "0");
	const min = date.getUTCMinutes().toString().padStart(2, "0");
	return `subagent-${yyyy}-${mm}-${dd}-${hh}${min}-${randomBytes(2).toString("hex")}`;
}

async function readJsonObject(path: string): Promise<Record<string, unknown> | undefined> {
	try {
		const raw = await readFile(path, "utf8");
		const parsed = JSON.parse(raw) as unknown;
		if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
		throw new Error("JSON file must contain an object");
	} catch (error) {
		const err = error as NodeJS.ErrnoException;
		if (err.code === "ENOENT") return undefined;
		if (error instanceof SyntaxError) throw new Error(error.message);
		throw error;
	}
}

async function appendJsonlAtomic(path: string, value: Record<string, unknown>): Promise<void> {
	await withFileMutationQueue(path, async () => {
		await mkdir(dirname(path), { recursive: true });
		await appendFile(path, `${JSON.stringify(value)}\n`, "utf8");
	});
}

async function writeJsonAtomic(path: string, value: Record<string, unknown>): Promise<void> {
	await withFileMutationQueue(path, async () => {
		await mkdir(dirname(path), { recursive: true });
		const tempPath = `${path}.${process.pid}.${Date.now()}.${randomUUID()}.tmp`;
		await writeFile(tempPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
		await rename(tempPath, path);
	});
}

async function bindSubagentExtensions(session: AgentSession): Promise<void> {
	const noopUi: ExtensionUIContext = {
		select: async () => undefined,
		confirm: async () => false,
		input: async () => undefined,
		notify: () => {},
		onTerminalInput: () => () => {},
		setStatus: () => {},
		setWorkingMessage: () => {},
		setWorkingVisible: () => {},
		setWorkingIndicator: () => {},
		setHiddenThinkingLabel: () => {},
		setWidget: () => {},
		setFooter: () => {},
		setHeader: () => {},
		setTitle: () => {},
		custom: async <T>() => undefined as T,
		pasteToEditor: () => {},
		setEditorText: () => {},
		getEditorText: () => "",
		editor: async () => undefined,
		addAutocompleteProvider: () => {},
		setEditorComponent: () => {},
		getEditorComponent: () => undefined,
		get theme() {
			return {} as ExtensionUIContext["theme"];
		},
		getAllThemes: () => [],
		getTheme: () => undefined,
		setTheme: () => ({ success: false, error: "subagent UI is not interactive" }),
		getToolsExpanded: () => false,
		setToolsExpanded: () => {},
	};
	await session.bindExtensions({
		mode: "print",
		uiContext: noopUi,
		commandContextActions: {
			waitForIdle: () => session.agent.waitForIdle(),
			newSession: async () => ({ cancelled: true }),
			fork: async () => ({ cancelled: true }),
			navigateTree: async () => ({ cancelled: true }),
			switchSession: async () => ({ cancelled: true }),
			reload: async () => session.reload(),
		},
	});
}

function textFromAssistant(message: AssistantMessage): string {
	return message.content
		.filter((part) => part.type === "text")
		.map((part) => part.text)
		.join("\n");
}

function finalAssistantOutput(messages: readonly AgentMessage[]): string {
	for (let index = messages.length - 1; index >= 0; index--) {
		const message = messages[index];
		if (message?.role === "assistant") return textFromAssistant(message as AssistantMessage);
	}
	return "";
}

function isAssistantError(messages: readonly AgentMessage[]): string | undefined {
	for (let index = messages.length - 1; index >= 0; index--) {
		const message = messages[index];
		if (message?.role !== "assistant") continue;
		const assistant = message as AssistantMessage;
		if (assistant.stopReason === "error" || assistant.stopReason === "aborted") {
			return assistant.errorMessage ?? assistant.stopReason;
		}
		return undefined;
	}
	return undefined;
}

export class SubagentManager {
	private readonly live = new Map<string, LiveSubagent>();
	private readonly services: AgentSessionServices;

	constructor(services: AgentSessionServices) {
		this.services = services;
	}

	private root(): string {
		return join(this.services.cwd, ".pi", "workflows", "subagents");
	}

	private recordPath(id: string): string {
		return join(this.root(), id, "record.json");
	}

	private async writeRecord(record: SubagentRecord): Promise<SubagentRecord> {
		await writeJsonAtomic(this.recordPath(record.id), { ...record });
		await appendJsonlAtomic(this.indexPath(), {
			id: record.id,
			role: record.role,
			status: record.status,
			updated_at: record.updated_at,
			session_file: record.session_file,
		});
		return record;
	}

	private indexPath(): string {
		return join(this.root(), "index.jsonl");
	}

	private async writeTerminal(
		record: SubagentRecord,
		status: SubagentStatus,
		extra?: Partial<SubagentRecord>,
	): Promise<SubagentRecord> {
		return this.writeRecord({
			...record,
			...extra,
			status,
			updated_at: nowIso(),
			completed_at: nowIso(),
		});
	}

	async read(id: string): Promise<SubagentRecord | undefined> {
		const read = await readJsonObject(this.recordPath(id));
		return read as unknown as SubagentRecord | undefined;
	}

	async list(): Promise<SubagentRecord[]> {
		let entries: string[];
		try {
			entries = await readdir(this.root());
		} catch (error) {
			const err = error as NodeJS.ErrnoException;
			if (err.code === "ENOENT") return [];
			throw error;
		}
		const records = await Promise.all(entries.map((entry) => this.read(entry).catch(() => undefined)));
		return records
			.filter((record): record is SubagentRecord => record !== undefined)
			.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
	}

	async spawn(request: SubagentRunRequest): Promise<SubagentRunResult> {
		const id = defaultSubagentId();
		const now = nowIso();
		const record = await this.writeRecord({
			id,
			role: request.role,
			label: request.label,
			status: "queued",
			cwd: request.cwd ?? this.services.cwd,
			parent_session_id: request.parentSessionId,
			resumable: request.persistent !== false,
			created_at: now,
			updated_at: now,
			last_prompt_sha256: hashText(request.prompt),
		});
		const run = this.runRecord(record, request);
		if (request.detached) {
			return { record: (await this.read(id)) ?? record, messages: [], output: "" };
		}
		return run;
	}

	private async runRecord(record: SubagentRecord, request: SubagentRunRequest): Promise<SubagentRunResult> {
		const controller = new AbortController();
		const abort = () => controller.abort();
		if (request.signal?.aborted) abort();
		else request.signal?.addEventListener("abort", abort, { once: true });
		const promise = this.executeRecord(record, request, controller.signal);
		this.live.set(record.id, { controller, promise, pauseRequested: false });
		try {
			return await promise;
		} finally {
			request.signal?.removeEventListener("abort", abort);
			this.live.delete(record.id);
		}
	}

	private async executeRecord(
		record: SubagentRecord,
		request: SubagentRunRequest,
		signal: AbortSignal,
	): Promise<SubagentRunResult> {
		const sessionManager = request.resumeSessionFile
			? SessionManager.open(request.resumeSessionFile, undefined, record.cwd)
			: request.persistent === false
				? SessionManager.inMemory(record.cwd)
				: SessionManager.create(record.cwd, undefined, { id: record.id });
		const created = await createAgentSessionFromServices({
			services: this.services,
			sessionManager,
			tools: request.tools,
			skipWorkflowContinuation: true,
		});
		const session = created.session;
		const live = this.live.get(record.id);
		if (live) live.session = session;
		await bindSubagentExtensions(session);
		if (request.systemPrompt) {
			session.agent.state.systemPrompt = `${session.agent.state.systemPrompt}\n\n${request.systemPrompt}`;
		}
		await this.writeRecord({
			...record,
			status: "running",
			started_at: nowIso(),
			updated_at: nowIso(),
			session_id: session.sessionId,
			session_file: session.sessionFile,
		});
		try {
			if (signal.aborted) throw new Error("subagent aborted");
			const abort = () => void session.abort();
			signal.addEventListener("abort", abort, { once: true });
			try {
				await session.prompt(request.prompt, { expandPromptTemplates: true, source: "extension" });
			} finally {
				signal.removeEventListener("abort", abort);
			}
			const messages = session.state.messages;
			const errorText = isAssistantError(messages);
			const output = finalAssistantOutput(messages);
			const completed = await this.writeRecord({
				...((await this.read(record.id)) ?? record),
				status: errorText ? "failed" : "completed",
				updated_at: nowIso(),
				completed_at: nowIso(),
				result_text: output,
				error_text: errorText,
				session_file: session.sessionFile,
				session_id: session.sessionId,
			});
			session.dispose();
			return { record: completed, messages, output };
		} catch (error) {
			const live = this.live.get(record.id);
			const paused = live?.pauseRequested === true;
			const message = error instanceof Error ? error.message : String(error);
			if (paused) {
				const pausedRecord = await this.writeRecord({
					...((await this.read(record.id)) ?? record),
					status: "paused",
					updated_at: nowIso(),
					error_text: message,
					session_file: session.sessionFile,
					session_id: session.sessionId,
				});
				session.dispose();
				return {
					record: pausedRecord,
					messages: session.state.messages,
					output: finalAssistantOutput(session.state.messages),
				};
			}
			const failed = await this.writeRecord({
				...((await this.read(record.id)) ?? record),
				status: signal.aborted ? "cancelled" : "failed",
				updated_at: nowIso(),
				completed_at: nowIso(),
				error_text: message,
				session_file: session.sessionFile,
				session_id: session.sessionId,
			});
			session.dispose();
			return {
				record: failed,
				messages: session.state.messages,
				output: finalAssistantOutput(session.state.messages),
			};
		}
	}

	async await(id: string): Promise<SubagentRunResult | undefined> {
		const live = this.live.get(id);
		if (live) return live.promise;
		const record = await this.read(id);
		if (!record) return undefined;
		return { record, messages: [], output: record.result_text ?? "" };
	}

	async waitFor(id: string, options?: SubagentAwaitOptions): Promise<SubagentAwaitResult> {
		const live = this.live.get(id);
		if (live) {
			if (options?.timeoutMs !== undefined && options.timeoutMs > 0) {
				const result = await Promise.race<SubagentRunResult | "timeout">([
					live.promise,
					new Promise<"timeout">((resolve) => {
						const timer = setTimeout(() => resolve("timeout"), options.timeoutMs);
						timer.unref?.();
					}),
				]);
				if (result === "timeout") {
					const record = await this.read(id);
					return { ok: false, reason: "timeout", record, timedOut: true };
				}
				return { ok: true, result };
			}
			return { ok: true, result: await live.promise };
		}
		const record = await this.read(id);
		if (!record) return { ok: false, reason: "not_found" };
		return { ok: true, result: { record, messages: [], output: record.result_text ?? "" } };
	}

	async pause(id: string): Promise<{ ok: boolean; reason?: string; record?: SubagentRecord }> {
		const live = this.live.get(id);
		if (!live) {
			const record = await this.read(id);
			return { ok: false, reason: "not_running", record: record ?? undefined };
		}
		if (live.pauseRequested) return { ok: false, reason: "already_paused" };
		live.pauseRequested = true;
		live.controller.abort();
		const result = await live.promise;
		return { ok: true, record: result.record };
	}

	async resume(
		id: string,
		message: string,
		options?: Pick<SubagentRunRequest, "systemPrompt" | "tools" | "signal">,
	): Promise<SubagentResumeResult> {
		const record = await this.read(id);
		if (!record) return { ok: false, reason: "not_found" };
		if (!record.resumable || !record.session_file) return { ok: false, reason: "context_unavailable", record };
		try {
			const result = await this.runRecord(
				{ ...record, status: "queued", updated_at: nowIso(), last_prompt_sha256: hashText(message) },
				{
					role: record.role,
					prompt: message,
					cwd: record.cwd,
					persistent: true,
					resumeSessionFile: record.session_file,
					systemPrompt: options?.systemPrompt,
					tools: options?.tools,
					signal: options?.signal,
				},
			);
			return { ok: true, result };
		} catch {
			return { ok: false, reason: "resume_failed", record };
		}
	}

	async steer(id: string, message: string, delivery: SubagentDelivery = "steer"): Promise<SubagentResumeResult> {
		const live = this.live.get(id);
		if (!live?.session) return this.resume(id, message);
		if (delivery === "followUp") await live.session.sendUserMessage(message, { deliverAs: "followUp" });
		else await live.session.sendUserMessage(message, { deliverAs: "steer" });
		const record = await this.read(id);
		return {
			ok: true,
			result: { record: record ?? (await live.promise).record, messages: [], output: record?.result_text ?? "" },
		};
	}

	async cancel(id: string): Promise<SubagentRecord | undefined> {
		const live = this.live.get(id);
		if (live) live.controller.abort();
		const record = await this.read(id);
		if (!record) return undefined;
		return this.writeTerminal(record, "cancelled");
	}
}
