import { createHash, randomBytes } from "node:crypto";
import { type AgentMessage, type Api, isValidThinkingLevel, type Model, type ThinkingLevel } from "@tsuuanmi/pi-agent";
import type { AssistantMessage } from "@tsuuanmi/pi-ai";
import type { ExtensionUIContext } from "#pi/api/ui-types";
import { type AgentProfile, loadAgentProfile } from "#pi/loader/agents/profiles";
import type { AgentSession } from "#pi/runtime/agent-session";
import {
	type AgentSessionServices,
	createAgentSessionFromServices,
	createAgentSessionServices,
} from "#pi/runtime/agent-session-services";
import { SessionManager } from "#pi/session/manager";
import type { SubagentManagerApi } from "#pi/subagents/manager-api";
import { renderSubagentProgress, type SubagentProgress, SubagentProgressTracker } from "#pi/subagents/progress";
import { SubagentStore } from "#pi/subagents/store";
import { TmuxBackend, type TmuxBackendOptions } from "#pi/subagents/tmux-backend";
import type {
	AttachResult,
	BackendKind,
	InspectResult,
	KillResult,
	ResolvedSubagentRequest,
	SubagentRecord as RuntimeRecord,
	SubagentRunResult as RuntimeResult,
	SubagentAwaitOptions,
	SubagentAwaitResult,
	SubagentControls,
	SubagentDelivery,
	SubagentRequest,
	SubagentResumeResult,
	SubagentStatus,
	Visibility,
	WorkerRequest,
} from "#pi/subagents/types";
import { extractYieldFromMessages } from "#pi/subagents/yield-result";

export type {
	AttachResult,
	BackendKind,
	InspectResult,
	KillFailureReason,
	KillResult,
	SubagentAwaitOptions,
	SubagentAwaitResult,
	SubagentDelivery,
	SubagentRecord,
	SubagentRequest,
	SubagentResumeResult,
	SubagentRunResult,
	SubagentStatus,
	Visibility,
} from "#pi/subagents/types";

type SubagentRecord = RuntimeRecord;
type SubagentRunRequest = SubagentRequest;
type SubagentRunResult = RuntimeResult;

interface LiveSubagent {
	controller: AbortController;
	promise: Promise<SubagentRunResult>;
	session?: AgentSession;
	pauseRequested: boolean;
	storageSessionId: string;
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
			navigateTree: async () => ({ cancelled: true }),
			switchSession: async () => ({ cancelled: true }),
			reload: async () => session.reload(),
		},
	});
}

function textFromAgent(message: AssistantMessage): string {
	return message.content
		.filter((part) => part.type === "text")
		.map((part) => part.text)
		.join("\n");
}

function finalAgentOutput(messages: readonly AgentMessage[]): string {
	for (let index = messages.length - 1; index >= 0; index--) {
		const message = messages[index];
		if (message?.role === "assistant") return textFromAgent(message as AssistantMessage);
	}
	return "";
}

function isAgentError(messages: readonly AgentMessage[]): string | undefined {
	for (let index = messages.length - 1; index >= 0; index--) {
		const message = messages[index];
		if (message?.role !== "assistant") continue;
		const agentMessage = message as AssistantMessage;
		if (agentMessage.stopReason === "error" || agentMessage.stopReason === "aborted") {
			return agentMessage.errorMessage ?? agentMessage.stopReason;
		}
		return undefined;
	}
	return undefined;
}

function recordOutput(record: SubagentRecord): string {
	return record.result_text ?? record.error_text ?? "";
}

function isTerminalStatus(status: SubagentStatus): boolean {
	return status === "completed" || status === "failed" || status === "cancelled";
}

function excludeNestedSubagentTools(tools: string[] | undefined): string[] | undefined {
	return tools?.filter((tool) => !tool.startsWith("subagent_"));
}

function resolveBackend(visibility: Visibility | undefined): BackendKind {
	return visibility === "tmux" ? "tmux" : "native";
}

function isThinkingLevel(value: unknown): value is ThinkingLevel {
	return typeof value === "string" && isValidThinkingLevel(value);
}

interface SubagentManagerOptions {
	tmux?: TmuxBackendOptions;
}

function mergeSystemPrompt(profile: AgentProfile | undefined, request: SubagentRunRequest): string | undefined {
	const parts = [profile?.systemPrompt, profile?.appendSystemPrompt, request.systemPrompt].filter(
		(part): part is string => typeof part === "string" && part.trim().length > 0,
	);
	return parts.length > 0 ? parts.join("\n\n") : undefined;
}

function buildSubagentObservabilityPrompt(input: {
	parentSessionId?: string;
	subagentId: string;
	cwd: string;
	visibility?: Visibility;
}): string {
	const sessionLine = input.parentSessionId
		? `Parent/current session id: ${input.parentSessionId}. Keep status and final summaries attributable to this session.`
		: "Parent/current session id: unavailable. Include enough status context for the caller to inspect this run.";
	const visibility = input.visibility ?? "native";
	const visibilityLine =
		visibility === "tmux"
			? "Visibility requested: tmux. If this task needs live terminal work, create or use an explicit tmux session/pane and report its attach/list/inspect/cleanup commands."
			: "Visibility requested: native. Use Pi-native receipts/status for normal subagent work; use explicit tmux only if long-running terminal work is necessary.";
	return [
		"Subagent observability contract:",
		sessionLine,
		`Subagent id: ${input.subagentId}. Working directory: ${input.cwd}.`,
		visibilityLine,
		"Do not hide long-running work. For dev servers, watchers, debuggers, REPLs, and log tails, prefer an explicit tmux session over a detached background process.",
		"When you start or recommend tmux-backed work, surface the session name, command summary, cwd, attach command, inspect/list command, and cleanup command so the parent session can render a structured receipt.",
	].join("\n");
}

function appendSystemPrompt(base: string | undefined, addition: string): string {
	return base && base.trim().length > 0 ? `${base}\n\n${addition}` : addition;
}

function parseModelRef(ref: string): { provider: string; modelId: string } {
	const slash = ref.indexOf("/");
	if (slash <= 0 || slash === ref.length - 1) {
		throw new Error(`agent model must use provider/model format: ${ref}`);
	}
	return { provider: ref.slice(0, slash), modelId: ref.slice(slash + 1) };
}

export class SubagentManager implements SubagentManagerApi, SubagentControls {
	private readonly live = new Map<string, LiveSubagent>();
	private readonly services: AgentSessionServices;
	private readonly store: SubagentStore;
	private readonly tmuxBackend: TmuxBackend;
	private readonly progressTracker = new SubagentProgressTracker();

	constructor(services: AgentSessionServices, options: SubagentManagerOptions = {}) {
		this.services = services;
		this.store = new SubagentStore(services.cwd);
		this.tmuxBackend = new TmuxBackend(
			{
				storageRoot: services.cwd,
				recordPath: (id, sessionId) => this.store.recordPath(id, sessionId),
				read: (id, sessionId) => this.store.read(id, sessionId),
				writeRecord: (record, sessionId) => this.store.write(record, sessionId),
				writeTerminal: (record, status, sessionId, extra) => this.store.terminal(record, status, sessionId, extra),
			},
			options.tmux,
		);
	}

	/** Get the retained progress snapshot for a subagent. */
	getProgress(id: string): SubagentProgress | undefined {
		return this.progressTracker.getProgress(id);
	}

	/** Render a progress snapshot as a diagnostic string for timeout/failure display. */
	renderProgress(id: string): string | undefined {
		const progress = this.progressTracker.getProgress(id);
		return progress ? renderSubagentProgress(progress) : undefined;
	}

	/**
	 * Count of currently-live (non-terminal) subagents: running plus paused. A
	 * subagent enters `live` when its run starts and leaves when the run promise
	 * settles (resolves or rejects); paused runs stay live until they are
	 * resumed-and-resolved or cancelled.
	 */
	getActiveCount(): number {
		return this.live.size;
	}

	private liveFor(id: string, sessionId: string): LiveSubagent | undefined {
		const live = this.live.get(id);
		return live?.storageSessionId === sessionId ? live : undefined;
	}

	async read(id: string, sessionId: string): Promise<SubagentRecord | undefined> {
		return this.store.read(id, sessionId);
	}

	async list(sessionId: string): Promise<SubagentRecord[]> {
		return this.store.list(sessionId);
	}

	private async resolveRequest(request: SubagentRunRequest): Promise<ResolvedSubagentRequest> {
		const profile = await loadAgentProfile(this.services, request.agent);
		if (request.agent && !profile) throw new Error(`agent profile not found: ${request.agent}`);
		const modelRef = request.model ?? profile?.model;
		let modelObject: Model<Api> | undefined;
		if (modelRef) {
			const { provider, modelId } = parseModelRef(modelRef);
			modelObject = this.services.modelRegistry.find(provider, modelId);
			if (!modelObject) throw new Error(`agent model not found: ${modelRef}`);
		}
		return {
			...request,
			role: request.role ?? profile?.name ?? "subagent",
			tools: request.tools ?? profile?.tools,
			excludeTools: request.excludeTools ?? profile?.excludeTools,
			modelRef,
			modelObject,
			thinkingLevel: request.thinkingLevel ?? profile?.thinkingLevel,
			persistent: request.persistent ?? profile?.persistent,
			resolvedSystemPrompt: mergeSystemPrompt(profile, request),
		};
	}

	async spawn(request: SubagentRunRequest): Promise<SubagentRunResult> {
		const backendKind = resolveBackend(request.visibility);
		const resolved = await this.resolveRequest(request);
		const id = defaultSubagentId();
		const now = nowIso();
		const storageSessionId = resolved.storageSessionId ?? resolved.parentSessionId;
		if (!storageSessionId)
			throw new Error("subagent spawn requires a session id (storageSessionId or parentSessionId)");
		const artifactFile = this.store.artifactPath(id, storageSessionId);
		if (backendKind === "tmux") {
			return this.tmuxBackend.spawn(id, resolved, storageSessionId, now, artifactFile, hashText(resolved.prompt));
		}
		const record = await this.store.write(
			{
				id,
				role: resolved.role,
				label: resolved.label,
				agent_profile: resolved.agent,
				model: resolved.modelRef,
				thinking_level: resolved.thinkingLevel,
				status: "queued",
				cwd: resolved.cwd ?? this.services.cwd,
				parent_session_id: resolved.parentSessionId,
				visibility: resolved.visibility ?? "native",
				resumable: resolved.persistent !== false,
				created_at: now,
				updated_at: now,
				last_prompt_sha256: hashText(resolved.prompt),
				artifact_file: artifactFile,
			},
			storageSessionId,
		);
		const run = this.runRecord(record, resolved);
		if (request.detached) {
			void run.catch(() => undefined);
			return { record: (await this.read(id, storageSessionId)) ?? record, messages: [], output: "" };
		}
		return run;
	}

	async runWorkerRequest(worker: WorkerRequest): Promise<SubagentRunResult> {
		if (worker.storageRoot !== this.services.cwd) {
			throw new Error(`worker storageRoot mismatch: ${worker.storageRoot}`);
		}
		const record = await this.read(worker.subagentId, worker.storageSessionId);
		if (!record) throw new Error(`subagent record not found: ${worker.subagentId}`);
		const thinkingLevel = worker.request.thinkingLevel;
		const resolved = await this.resolveRequest({
			...worker.request,
			thinkingLevel: isThinkingLevel(thinkingLevel) ? thinkingLevel : undefined,
			visibility: "native",
			storageSessionId: worker.storageSessionId,
		});
		return this.runRecord(record, resolved);
	}

	private async runRecord(record: SubagentRecord, request: ResolvedSubagentRequest): Promise<SubagentRunResult> {
		const storageSessionId = request.storageSessionId ?? request.parentSessionId ?? record.parent_session_id;
		if (!storageSessionId) throw new Error("subagent run requires a session id");
		const controller = new AbortController();
		const abort = () => controller.abort();
		if (request.signal?.aborted) abort();
		else request.signal?.addEventListener("abort", abort, { once: true });
		const promise = this.executeRecord(record, request, controller.signal).catch(async (error) => {
			this.live.get(record.id)?.session?.dispose();
			const current = await this.read(record.id, storageSessionId);
			if (!current) throw error;
			if (isTerminalStatus(current.status)) {
				return { record: current, messages: [], output: recordOutput(current) };
			}
			const message = error instanceof Error ? error.message : String(error);
			const status = controller.signal.aborted ? "cancelled" : "failed";
			this.progressTracker.markTerminal(record.id, status);
			const failed = await this.store.terminal(current, status, storageSessionId, { error_text: message });
			return { record: failed, messages: [], output: recordOutput(failed) };
		});
		this.live.set(record.id, {
			controller,
			promise,
			pauseRequested: false,
			storageSessionId,
		});
		try {
			return await promise;
		} finally {
			request.signal?.removeEventListener("abort", abort);
			this.live.delete(record.id);
		}
	}

	/**
	 * Build a fresh, isolated AgentSessionServices for a subagent session.
	 *
	 * The subagent reuses the parent's auth, model registry, settings manager, cwd,
	 * and extension configuration, but gets its own ResourceLoader (and therefore
	 * its own ExtensionRuntime and Extension instances). This keeps subagent
	 * dispose/reload from invalidating or clobbering the parent session's shared
	 * extension runtime.
	 *
	 * The parent SettingsManager is reused (not recreated) so the subagent inherits
	 * the parent's resolved settings.
	 */
	private async createIsolatedServices(): Promise<AgentSessionServices> {
		return createAgentSessionServices({
			cwd: this.services.cwd,
			agentDir: this.services.agentDir,
			authStorage: this.services.authStorage,
			settingsManager: this.services.settingsManager,
			modelRegistry: this.services.modelRegistry,
			resourceLoaderOptions: this.services.resourceLoaderOptions,
			extensionFlagValues: this.services.extensionFlagValues,
		});
	}

	private async executeRecord(
		record: SubagentRecord,
		request: ResolvedSubagentRequest,
		signal: AbortSignal,
	): Promise<SubagentRunResult> {
		const storageSessionId = request.storageSessionId ?? request.parentSessionId ?? record.parent_session_id;
		if (!storageSessionId)
			throw new Error("subagent run requires a session id (storageSessionId or parentSessionId)");
		const sessionManager = request.resumeSessionFile
			? SessionManager.open(request.resumeSessionFile, undefined, record.cwd)
			: request.persistent === false
				? SessionManager.inMemory(record.cwd)
				: SessionManager.create(
						record.cwd,
						storageSessionId ? this.store.sessionLogDir(storageSessionId) : undefined,
						{
							id: record.id,
						},
					);
		if (signal.aborted) throw new Error("subagent aborted");
		// Subagents must not share the parent session's ResourceLoader: a ResourceLoader
		// caches a single ExtensionRuntime and one set of Extension objects, and
		// disposing a subagent session invalidates that shared runtime, which would
		// stale-ify the parent's captured extension API (surfacing as "This extension
		// ctx is stale after session replacement or reload" on the parent's next
		// before_agent_start). Build an isolated services bundle with its own resource
		// loader (reusing the parent's settings manager to preserve active overrides)
		// that mirrors the parent's extension configuration.
		const services = await this.createIsolatedServices();
		const observabilityPrompt = buildSubagentObservabilityPrompt({
			parentSessionId: request.parentSessionId,
			subagentId: record.id,
			cwd: record.cwd,
			visibility: request.visibility,
		});
		const created = await createAgentSessionFromServices({
			services,
			sessionManager,
			model: request.modelObject,
			thinkingLevel: request.thinkingLevel,
			tools: excludeNestedSubagentTools(request.tools),
			excludeTools: request.excludeTools,
			skipWorkflowContinuation: true,
			extraSystemPrompt: appendSystemPrompt(request.resolvedSystemPrompt, observabilityPrompt),
			// Subagent sessions do not get their own SubagentManager to prevent unbounded nesting.
			// A subagent cannot spawn further subagents; use the parent manager for orchestration.
			subagentManager: null,
			apiUsageSessionId: storageSessionId,
		});
		const session = created.session;
		if (signal.aborted) {
			session.dispose();
			throw new Error("subagent aborted");
		}
		const live = this.live.get(record.id);
		if (live) {
			live.session = session;
			session.agent.shouldPause = () => live.pauseRequested;
		}
		await bindSubagentExtensions(session);
		if (signal.aborted) {
			session.dispose();
			throw new Error("subagent aborted");
		}

		await this.store.write(
			{
				...record,
				status: "running",
				started_at: nowIso(),
				updated_at: nowIso(),
				session_id: session.sessionId,
				session_file: session.sessionFile,
			},
			storageSessionId,
		);
		// Start progress tracking so retained snapshots survive timeout/failure
		this.progressTracker.startTracking(record.id, (handler) => session.subscribe(handler));
		try {
			if (signal.aborted) throw new Error("subagent aborted");
			const abort = () => void session.abort();
			signal.addEventListener("abort", abort, { once: true });
			try {
				await session.prompt(request.prompt, { expandPromptTemplates: true, source: "extension" });
			} finally {
				signal.removeEventListener("abort", abort);
			}
			if (signal.aborted) throw new Error("subagent aborted");
			// Cooperative pause: shouldStopAfterTurn exited the loop gracefully.
			// prompt() resolved normally but the agent stopped mid-run.
			if (live?.pauseRequested) {
				this.progressTracker.markTerminal(record.id, "paused");
				const pausedRecord = await this.store.write(
					{
						...((await this.read(record.id, storageSessionId)) ?? record),
						status: "paused",
						updated_at: nowIso(),
						session_file: session.sessionFile,
						session_id: session.sessionId,
					},
					storageSessionId,
				);
				session.dispose();
				return {
					record: pausedRecord,
					messages: session.state.messages,
					output: finalAgentOutput(session.state.messages),
				};
			}
			const messages = session.state.messages;
			const errorText = isAgentError(messages);
			const output = finalAgentOutput(messages);
			const yieldResult = extractYieldFromMessages(messages);
			const terminalStatus = errorText ? "failed" : "completed";
			this.progressTracker.markTerminal(record.id, terminalStatus);
			const completed = await this.store.terminal(
				(await this.read(record.id, storageSessionId)) ?? record,
				terminalStatus,
				storageSessionId,
				{
					result_text: output,
					error_text: errorText,
					...(yieldResult ? { yield_result: yieldResult } : {}),
					session_file: session.sessionFile,
					session_id: session.sessionId,
				},
			);
			session.dispose();
			return { record: completed, messages, output };
		} catch (error) {
			const live = this.live.get(record.id);
			const paused = live?.pauseRequested === true;
			const message = error instanceof Error ? error.message : String(error);
			if (paused && !signal.aborted) {
				this.progressTracker.markTerminal(record.id, "paused");
				const pausedRecord = await this.store.write(
					{
						...((await this.read(record.id, storageSessionId)) ?? record),
						status: "paused",
						updated_at: nowIso(),
						error_text: message,
						session_file: session.sessionFile,
						session_id: session.sessionId,
					},
					storageSessionId,
				);
				session.dispose();
				return {
					record: pausedRecord,
					messages: session.state.messages,
					output: finalAgentOutput(session.state.messages),
				};
			}
			const failStatus = signal.aborted ? "cancelled" : "failed";
			this.progressTracker.markTerminal(record.id, failStatus);
			const failed = await this.store.terminal(
				(await this.read(record.id, storageSessionId)) ?? record,
				failStatus,
				storageSessionId,
				{
					error_text: message,
					session_file: session.sessionFile,
					session_id: session.sessionId,
				},
			);
			session.dispose();
			return {
				record: failed,
				messages: session.state.messages,
				output: finalAgentOutput(session.state.messages),
			};
		}
	}

	async await(id: string, sessionId: string): Promise<SubagentRunResult | undefined> {
		const live = this.liveFor(id, sessionId);
		if (live) return live.promise;
		const record = await this.read(id, sessionId);
		if (!record) return undefined;
		return { record, messages: [], output: recordOutput(record) };
	}

	async waitFor(id: string, options: SubagentAwaitOptions): Promise<SubagentAwaitResult> {
		const live = this.liveFor(id, options.sessionId);
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
					const record = await this.read(id, options.sessionId);
					return {
						ok: false,
						reason: "timeout",
						record,
						timedOut: true,
						progress: this.progressTracker.getProgress(id),
					};
				}
				return { ok: true, result };
			}
			return { ok: true, result: await live.promise };
		}
		const record = await this.read(id, options.sessionId);
		if (!record) return { ok: false, reason: "not_found" };
		return { ok: true, result: { record, messages: [], output: recordOutput(record) } };
	}

	async pause(id: string, sessionId: string): Promise<{ ok: boolean; reason?: string; record?: SubagentRecord }> {
		const live = this.liveFor(id, sessionId);
		if (!live) {
			const record = await this.read(id, sessionId);
			return { ok: false, reason: "not_running", record: record ?? undefined };
		}
		if (live.pauseRequested) return { ok: false, reason: "already_paused" };
		live.pauseRequested = true;
		// Cooperative pause: shouldStopAfterTurn will check pauseRequested and exit
		// the agent loop after the current turn. No abort needed.
		const result = await live.promise;
		return { ok: true, record: result.record };
	}

	async resume(
		id: string,
		message: string,
		options: Pick<
			SubagentRunRequest,
			"agent" | "systemPrompt" | "tools" | "excludeTools" | "model" | "thinkingLevel" | "signal" | "storageSessionId"
		>,
	): Promise<SubagentResumeResult> {
		if (!options.storageSessionId) throw new Error("subagent resume requires a session id (storageSessionId)");
		const storageSessionId = options.storageSessionId;
		const record = await this.read(id, storageSessionId);
		if (!record) return { ok: false, reason: "not_found" };
		if (!record.resumable || !record.session_file) return { ok: false, reason: "context_unavailable", record };
		try {
			const resolved = await this.resolveRequest({
				agent: options.agent ?? record.agent_profile,
				role: record.role,
				prompt: message,
				cwd: record.cwd,
				persistent: true,
				resumeSessionFile: record.session_file,
				systemPrompt: options.systemPrompt,
				tools: options.tools,
				excludeTools: options.excludeTools,
				model: options.model ?? record.model,
				thinkingLevel: options.thinkingLevel ?? record.thinking_level,
				signal: options.signal,
				storageSessionId,
			});
			const result = await this.runRecord(
				{ ...record, status: "queued", updated_at: nowIso(), last_prompt_sha256: hashText(message) },
				resolved,
			);
			return { ok: true, result };
		} catch {
			return { ok: false, reason: "resume_failed", record };
		}
	}

	async steer(
		id: string,
		message: string,
		delivery: SubagentDelivery = "steer",
		sessionId: string,
	): Promise<SubagentResumeResult> {
		const live = this.liveFor(id, sessionId);
		if (!live?.session) return this.resume(id, message, { storageSessionId: sessionId });
		if (delivery === "followUp") await live.session.sendUserMessage(message, { deliverAs: "followUp" });
		else await live.session.sendUserMessage(message, { deliverAs: "steer" });
		const record = await this.read(id, sessionId);
		return {
			ok: true,
			result: { record: record ?? (await live.promise).record, messages: [], output: record?.result_text ?? "" },
		};
	}

	async inspect(id: string, sessionId: string): Promise<InspectResult> {
		const record = await this.read(id, sessionId);
		if (!record) return { ok: false, reason: "not_found" };
		const result: InspectResult = {
			ok: true,
			record,
			artifactPath: record.artifact_file ?? this.store.artifactPath(id, sessionId),
		};
		return record.tmux ? { ...result, ...this.tmuxBackend.inspect(record) } : result;
	}

	async attach(id: string, sessionId: string): Promise<AttachResult> {
		const record = await this.read(id, sessionId);
		if (!record) return { ok: false, reason: "not_found" };
		return this.tmuxBackend.attach(record);
	}

	async kill(id: string, sessionId: string): Promise<KillResult> {
		const record = await this.read(id, sessionId);
		if (!record) return { ok: false, reason: "not_found" };
		return this.tmuxBackend.kill(record, sessionId);
	}

	async cancel(id: string, sessionId: string): Promise<SubagentRecord | undefined> {
		const live = this.liveFor(id, sessionId);
		if (live) {
			live.controller.abort();
			try {
				return (await live.promise).record;
			} catch {
				// The execution wrapper normally persists the terminal cancellation.
				// Re-read below so cancellation still returns the durable record if
				// an unexpected startup failure escaped the wrapper.
			}
		}
		const record = await this.read(id, sessionId);
		if (!record) return undefined;
		if (isTerminalStatus(record.status)) return record;
		return this.store.terminal(record, "cancelled", sessionId);
	}

	/** Tear down the manager: abort all live subagents and wait for them to settle. */
	async dispose(): Promise<void> {
		const live = [...this.live.values()];
		for (const run of live) run.controller.abort();
		await Promise.allSettled(live.map((run) => run.promise));
		this.live.clear();
	}
}
