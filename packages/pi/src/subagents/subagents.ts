import { spawnSync } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { appendFile, mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type {
	AgentMessage,
	SubagentAttachResult,
	SubagentAwaitOptions,
	SubagentAwaitResult,
	SubagentBackendKind,
	SubagentDelivery,
	SubagentInspectResult,
	SubagentKillResult,
	SubagentRecord,
	SubagentResumeResult,
	SubagentRunIdentity,
	SubagentRunRequest,
	SubagentRunResult,
	SubagentStatus,
	SubagentTmuxMetadata,
	SubagentTmuxTarget,
	SubagentVisibility,
	ThinkingLevel,
} from "@tsuuanmi/pi-agent";
import {
	buildTmuxCommands,
	createSubagentRunIdentity,
	extractYieldFromMessages,
	isSubagentRunIdentity,
	renderSubagentProgress,
	type SubagentProgress,
	SubagentProgressTracker,
	tmuxRecordMatchesIdentity,
} from "@tsuuanmi/pi-agent";
import { withFileMutationQueue } from "@tsuuanmi/pi-agent/node";
import type { Api, AssistantMessage, Model } from "@tsuuanmi/pi-ai";
import { type AgentProfile, loadAgentProfile } from "#pi/agents/agent-profiles";
import type { ExtensionUIContext } from "#pi/api/types";
import { buildTmuxSubagentLaunchPlan, isTmuxCommandAvailable, type TmuxSpawnSync } from "#pi/cli/launch-tmux";
import type { AgentSession } from "#pi/session/agent-session";
import {
	type AgentSessionServices,
	createAgentSessionFromServices,
	createAgentSessionServices,
} from "#pi/session/agent-session-services";
import { sessionStateDir } from "#pi/session/session-layout";
import { SessionManager } from "#pi/session/session-manager";

export type {
	SubagentAttachResult,
	SubagentAwaitOptions,
	SubagentAwaitResult,
	SubagentBackendKind,
	SubagentDelivery,
	SubagentInspectResult,
	SubagentKillResult,
	SubagentRecord,
	SubagentResumeFailureReason,
	SubagentResumeResult,
	SubagentRunRequest,
	SubagentRunResult,
	SubagentStatus,
} from "@tsuuanmi/pi-agent";

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

function recordOutput(record: SubagentRecord): string {
	return record.result_text ?? record.error_text ?? "";
}

function isTerminalStatus(status: SubagentStatus): boolean {
	return status === "completed" || status === "failed" || status === "cancelled";
}

function excludeNestedSubagentTools(tools: string[] | undefined): string[] | undefined {
	return tools?.filter((tool) => !tool.startsWith("subagent_"));
}

function resolveSubagentBackendKind(visibility: SubagentVisibility | undefined): SubagentBackendKind {
	return visibility === "tmux" ? "tmux" : "native";
}

class TmuxUnavailableError extends Error {
	readonly code = "tmux_unavailable";
	readonly backendKind: SubagentBackendKind = "tmux";

	constructor(message = "tmux backend unavailable") {
		super(message);
		this.name = "TmuxUnavailableError";
	}
}

function isThinkingLevel(value: unknown): value is ThinkingLevel {
	return (
		value === "off" ||
		value === "minimal" ||
		value === "low" ||
		value === "medium" ||
		value === "high" ||
		value === "xhigh"
	);
}

function defaultTmuxSpawnSync(
	command: string,
	args: string[],
	options: Parameters<TmuxSpawnSync>[2],
): ReturnType<TmuxSpawnSync> {
	const result = spawnSync(command, args, {
		cwd: options.cwd,
		env: options.env,
		stdio: [options.stdin, options.stdout, options.stderr],
	});
	return {
		exitCode: result.status,
		signalCode: result.signal,
		stdout: result.stdout?.toString(),
		stderr: result.stderr?.toString(),
	};
}

function parseTmuxLaunchTargetOutput(output: string | undefined, targetKind: "pane" | "session"): SubagentTmuxTarget {
	const fields = output?.trim().split(/\s+/) ?? [];
	if (targetKind === "pane") {
		const [session_name, session_id, window_id, window_index, pane_id, pane_index] = fields;
		if (!session_name || !session_id || !window_id || !pane_id || !window_index || !pane_index) {
			throw new Error(`tmux split-window did not return pane target metadata: ${output ?? "<empty>"}`);
		}
		return {
			kind: "pane",
			session_name,
			session_id,
			window_id,
			window_index: Number(window_index),
			pane_id,
			pane_index: Number(pane_index),
			target: pane_id,
		};
	}
	const [session_name, session_id] = fields;
	if (!session_name || !session_id) {
		throw new Error(`tmux new-session did not return session target metadata: ${output ?? "<empty>"}`);
	}
	return {
		kind: "session",
		session_name,
		session_id,
		target: `=${session_name}`,
	};
}

function tmuxMetadataFromTarget(
	target: SubagentTmuxTarget,
	requestPath: string,
	workerMetadataFile: string,
	visibleByDefault: boolean,
	tmuxCommand: string,
): SubagentTmuxMetadata {
	const commands = buildTmuxCommands(target, tmuxCommand);
	return {
		backend: "tmux",
		session_name: target.session_name,
		target,
		request_file: requestPath,
		worker_metadata_file: workerMetadataFile,
		attach_command: commands.attachCommand,
		inspect_command: commands.inspectCommand,
		cleanup_command: commands.cleanupCommand,
		visible_by_default: visibleByDefault,
	};
}

function tmuxTarget(record: SubagentRecord): string | undefined {
	return record.identity?.tmux.target.target ?? record.tmux?.target.target;
}

function tmuxCommandFromMetadata(tmux: SubagentTmuxMetadata, fallback: string): string {
	const command = tmux.cleanup_command.split(/\s+/, 1)[0]?.trim();
	return command || fallback;
}

function tmuxHasTargetArgs(target: SubagentTmuxTarget): string[] {
	return target.kind === "pane"
		? ["display-message", "-p", "-t", target.target, "#{pane_id}"]
		: ["has-session", "-t", target.target];
}

function tmuxCleanupArgs(target: SubagentTmuxTarget): [string, string, string] {
	return target.kind === "pane" ? ["kill-pane", "-t", target.target] : ["kill-session", "-t", target.target];
}

function isWorkerPidAlive(metadata: Pick<SubagentWorkerMetadataFile, "pid"> | undefined): boolean {
	const pid = metadata?.pid;
	if (typeof pid !== "number" || !Number.isInteger(pid) || pid <= 0) return false;
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
}

interface SubagentWorkerMetadataFile {
	version: 1;
	subagentId: string;
	storageSessionId: string;
	storageRoot: string;
	pid: number;
	startedAt: string;
	requestPath: string;
	identity?: SubagentRunIdentity;
}

function readWorkerMetadata(metadata: Record<string, unknown> | undefined): SubagentWorkerMetadataFile | undefined {
	if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return undefined;
	const root = metadata as Record<string, unknown>;
	if (root.version !== 1) return undefined;
	if (typeof root.subagentId !== "string" || typeof root.storageSessionId !== "string") return undefined;
	if (typeof root.storageRoot !== "string" || typeof root.pid !== "number" || typeof root.startedAt !== "string") {
		return undefined;
	}
	if (typeof root.requestPath !== "string") return undefined;
	if (root.identity !== undefined && !isSubagentRunIdentity(root.identity)) return undefined;
	return {
		version: 1,
		subagentId: root.subagentId,
		storageSessionId: root.storageSessionId,
		storageRoot: root.storageRoot,
		pid: root.pid,
		startedAt: root.startedAt,
		requestPath: root.requestPath,
		identity: root.identity as SubagentRunIdentity | undefined,
	};
}

interface SubagentManagerOptions {
	tmux?: {
		available?: (command: string) => boolean;
		spawnSync?: TmuxSpawnSync;
		env?: NodeJS.ProcessEnv;
		argv?: string[];
		execPath?: string;
		sessionName?: string;
	};
}

interface SubagentWorkerRequestFile {
	version: 1;
	subagentId: string;
	storageSessionId: string;
	storageRoot: string;
	request: SubagentRunRequest;
}

interface ResolvedSubagentRunRequest extends SubagentRunRequest {
	role: string;
	tools?: string[];
	excludeTools?: string[];
	modelRef?: string;
	modelObject?: Model<Api>;
	thinkingLevel?: ThinkingLevel;
	persistent?: boolean;
	resolvedSystemPrompt?: string;
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
	visibility?: SubagentVisibility;
}): string {
	const sessionLine = input.parentSessionId
		? `Parent/current session id: ${input.parentSessionId}. Keep status and final summaries attributable to this session.`
		: "Parent/current session id: unavailable. Include enough status context for the caller to inspect this run.";
	const visibility = input.visibility ?? "native";
	const visibilityLine =
		visibility === "tmux"
			? "Visibility requested: tmux. If this task needs live terminal work, create or use an explicit tmux session/pane and report its attach/list/inspect/cleanup commands."
			: visibility === "auto"
				? "Visibility requested: auto. Use native Pi receipts for normal work; choose explicit tmux only for live long-running terminal work."
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

export class SubagentManager {
	private readonly live = new Map<string, LiveSubagent>();
	private readonly services: AgentSessionServices;
	private readonly options: SubagentManagerOptions;
	private readonly progressTracker = new SubagentProgressTracker();

	constructor(services: AgentSessionServices, options: SubagentManagerOptions = {}) {
		this.services = services;
		this.options = options;
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

	private root(sessionId: string): string {
		if (!sessionId.trim()) throw new Error("subagent records require a session id");
		return join(sessionStateDir(this.services.cwd, sessionId), "subagents");
	}

	private recordPath(id: string, sessionId: string): string {
		return join(this.root(sessionId), id, "record.json");
	}

	private artifactPath(id: string, sessionId: string): string {
		return join(this.root(sessionId), id, "artifact.json");
	}

	private async writeArtifact(record: SubagentRecord, sessionId: string): Promise<void> {
		const artifactPath = record.artifact_file ?? this.artifactPath(record.id, sessionId);
		await writeJsonAtomic(artifactPath, {
			version: 1,
			subagentId: record.id,
			status: record.status,
			result_text: record.result_text,
			error_text: record.error_text,
			yield_result: record.yield_result,
			completed_at: record.completed_at,
		});
	}

	private async writeRecord(record: SubagentRecord, sessionId: string): Promise<SubagentRecord> {
		await writeJsonAtomic(this.recordPath(record.id, sessionId), { ...record });
		await appendJsonlAtomic(this.indexPath(sessionId), {
			id: record.id,
			role: record.role,
			status: record.status,
			updated_at: record.updated_at,
			session_file: record.session_file,
		});
		return record;
	}

	private indexPath(sessionId: string): string {
		return join(this.root(sessionId), "index.jsonl");
	}

	private sessionLogDir(sessionId: string): string {
		return join(this.root(sessionId), "sessions");
	}

	private async writeTerminal(
		record: SubagentRecord,
		status: SubagentStatus,
		sessionId: string,
		extra?: Partial<SubagentRecord>,
	): Promise<SubagentRecord> {
		const terminalRecord = {
			...record,
			...extra,
			artifact_file: record.artifact_file ?? this.artifactPath(record.id, sessionId),
			status,
			updated_at: nowIso(),
			completed_at: nowIso(),
		};
		await this.writeArtifact(terminalRecord, sessionId);
		return this.writeRecord(terminalRecord, sessionId);
	}

	async read(id: string, sessionId: string): Promise<SubagentRecord | undefined> {
		const read = await readJsonObject(this.recordPath(id, sessionId));
		return read as unknown as SubagentRecord | undefined;
	}

	async list(sessionId: string): Promise<SubagentRecord[]> {
		let entries: string[];
		try {
			entries = await readdir(this.root(sessionId));
		} catch (error) {
			const err = error as NodeJS.ErrnoException;
			if (err.code === "ENOENT") return [];
			throw error;
		}
		const records = await Promise.all(entries.map((entry) => this.read(entry, sessionId).catch(() => undefined)));
		return records
			.filter((record): record is SubagentRecord => record !== undefined)
			.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
	}

	private async resolveRequest(request: SubagentRunRequest): Promise<ResolvedSubagentRunRequest> {
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
		const backendKind = resolveSubagentBackendKind(request.visibility);
		const resolved = await this.resolveRequest(request);
		const id = defaultSubagentId();
		const now = nowIso();
		const storageSessionId = resolved.storageSessionId ?? resolved.parentSessionId;
		if (!storageSessionId)
			throw new Error("subagent spawn requires a session id (storageSessionId or parentSessionId)");
		const artifactFile = this.artifactPath(id, storageSessionId);
		if (backendKind === "tmux") return this.spawnTmux(id, resolved, storageSessionId, now, artifactFile);
		const record = await this.writeRecord(
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

	private async spawnTmux(
		id: string,
		request: ResolvedSubagentRunRequest,
		storageSessionId: string,
		now: string,
		artifactFile: string,
	): Promise<SubagentRunResult> {
		const env = this.options.tmux?.env ?? process.env;
		const tmuxCommand = env.PI_TMUX_COMMAND?.trim() || "tmux";
		const available = this.options.tmux?.available ?? isTmuxCommandAvailable;
		if (!available(tmuxCommand)) throw new TmuxUnavailableError(`tmux command not available: ${tmuxCommand}`);
		const storageRoot = this.services.cwd;
		const executionCwd = request.cwd ?? storageRoot;
		const workerDir = dirname(this.recordPath(id, storageSessionId));
		const requestPath = join(workerDir, "request.json");
		const workerMetadataFile = join(workerDir, "worker.json");
		const plan = buildTmuxSubagentLaunchPlan({
			cwd: executionCwd,
			subagentId: id,
			requestPath,
			env,
			argv: this.options.tmux?.argv,
			execPath: this.options.tmux?.execPath,
			tmuxCommand,
			sessionName: this.options.tmux?.sessionName,
		});
		await writeJsonAtomic(requestPath, {
			version: 1,
			subagentId: id,
			storageSessionId,
			storageRoot,
			request: {
				agent: request.agent,
				role: request.role,
				prompt: request.prompt,
				systemPrompt: request.systemPrompt,
				cwd: executionCwd,
				tools: request.tools,
				excludeTools: request.excludeTools,
				model: request.modelRef,
				thinkingLevel: request.thinkingLevel,
				persistent: request.persistent,
				label: request.label,
				parentSessionId: request.parentSessionId,
			},
		});
		const provisionalRecord = await this.writeRecord(
			{
				id,
				role: request.role,
				label: request.label,
				agent_profile: request.agent,
				model: request.modelRef,
				thinking_level: request.thinkingLevel,
				status: "running",
				cwd: executionCwd,
				parent_session_id: request.parentSessionId ?? storageSessionId,
				visibility: "tmux",
				resumable: request.persistent !== false,
				created_at: now,
				updated_at: now,
				started_at: now,
				last_prompt_sha256: hashText(request.prompt),
				artifact_file: artifactFile,
			},
			storageSessionId,
		);
		const spawn = this.options.tmux?.spawnSync ?? defaultTmuxSpawnSync;
		const launched = spawn(plan.tmuxCommand, plan.launchArgs, {
			cwd: plan.cwd,
			env,
			stdin: "inherit",
			stdout: "pipe",
			stderr: "inherit",
		});
		if (launched.exitCode !== 0) {
			const failed = await this.writeTerminal(provisionalRecord, "failed", storageSessionId, {
				error_text: launched.stderr?.trim() || "tmux worker launch failed",
			});
			return { record: failed, messages: [], output: failed.error_text ?? "" };
		}
		const targetKind = plan.launchArgs[0] === "split-window" ? "pane" : "session";
		let target: SubagentTmuxTarget;
		try {
			target = parseTmuxLaunchTargetOutput(launched.stdout, targetKind);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			const failed = await this.writeTerminal(provisionalRecord, "failed", storageSessionId, {
				error_text: message,
			});
			return { record: failed, messages: [], output: failed.error_text ?? "" };
		}
		const tmux = tmuxMetadataFromTarget(target, requestPath, workerMetadataFile, true, tmuxCommand);
		const identity = createSubagentRunIdentity({
			subagentId: id,
			parentSessionId: request.parentSessionId ?? storageSessionId,
			storageSessionId,
			storageRoot,
			executionCwd,
			requestPath,
			recordPath: this.recordPath(id, storageSessionId),
			artifactPath: artifactFile,
			workerMetadataPath: workerMetadataFile,
			lifecycleState: "running",
			cleanupEligible: true,
			tmux: {
				backend: "tmux",
				target,
				request_path: requestPath,
				worker_metadata_path: workerMetadataFile,
			},
		});
		const record = await this.writeRecord(
			{
				...provisionalRecord,
				identity,
				tmux,
			},
			storageSessionId,
		);
		return {
			record: (await this.read(id, storageSessionId)) ?? record,
			messages: [],
			output: launched.stdout?.trim() ?? "",
		};
	}

	async runWorkerRequest(worker: SubagentWorkerRequestFile): Promise<SubagentRunResult> {
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

	private async runRecord(record: SubagentRecord, request: ResolvedSubagentRunRequest): Promise<SubagentRunResult> {
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
		request: ResolvedSubagentRunRequest,
		signal: AbortSignal,
	): Promise<SubagentRunResult> {
		const storageSessionId = request.storageSessionId ?? request.parentSessionId ?? record.parent_session_id;
		if (!storageSessionId)
			throw new Error("subagent run requires a session id (storageSessionId or parentSessionId)");
		const sessionManager = request.resumeSessionFile
			? SessionManager.open(request.resumeSessionFile, undefined, record.cwd)
			: request.persistent === false
				? SessionManager.inMemory(record.cwd)
				: SessionManager.create(record.cwd, storageSessionId ? this.sessionLogDir(storageSessionId) : undefined, {
						id: record.id,
					});
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
		const live = this.live.get(record.id);
		if (live) {
			live.session = session;
			session.agent.shouldPause = () => live.pauseRequested;
		}
		await bindSubagentExtensions(session);

		await this.writeRecord(
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
			// Cooperative pause: shouldStopAfterTurn exited the loop gracefully.
			// prompt() resolved normally but the agent stopped mid-run.
			if (live?.pauseRequested) {
				this.progressTracker.markTerminal(record.id, "paused");
				const pausedRecord = await this.writeRecord(
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
					output: finalAssistantOutput(session.state.messages),
				};
			}
			const messages = session.state.messages;
			const errorText = isAssistantError(messages);
			const output = finalAssistantOutput(messages);
			const yieldResult = extractYieldFromMessages(messages);
			const terminalStatus = errorText ? "failed" : "completed";
			this.progressTracker.markTerminal(record.id, terminalStatus);
			const completed = await this.writeTerminal(
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
			if (paused) {
				this.progressTracker.markTerminal(record.id, "paused");
				const pausedRecord = await this.writeRecord(
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
					output: finalAssistantOutput(session.state.messages),
				};
			}
			const failStatus = signal.aborted ? "cancelled" : "failed";
			this.progressTracker.markTerminal(record.id, failStatus);
			const failed = await this.writeTerminal(
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
				output: finalAssistantOutput(session.state.messages),
			};
		}
	}

	async await(id: string, sessionId: string): Promise<SubagentRunResult | undefined> {
		const live = this.live.get(id);
		if (live) return live.promise;
		const record = await this.read(id, sessionId);
		if (!record) return undefined;
		return { record, messages: [], output: recordOutput(record) };
	}

	async waitFor(id: string, options: SubagentAwaitOptions): Promise<SubagentAwaitResult> {
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
		const live = this.live.get(id);
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
		const live = this.live.get(id);
		if (!live?.session) return this.resume(id, message, { storageSessionId: sessionId });
		if (delivery === "followUp") await live.session.sendUserMessage(message, { deliverAs: "followUp" });
		else await live.session.sendUserMessage(message, { deliverAs: "steer" });
		const record = await this.read(id, sessionId);
		return {
			ok: true,
			result: { record: record ?? (await live.promise).record, messages: [], output: record?.result_text ?? "" },
		};
	}

	async inspect(id: string, sessionId: string): Promise<SubagentInspectResult> {
		const record = await this.read(id, sessionId);
		if (!record) return { ok: false, reason: "not_found" };
		return {
			ok: true,
			record,
			artifactPath: record.artifact_file ?? this.artifactPath(id, sessionId),
			workerMetadataPath: record.tmux?.worker_metadata_file,
			...(record.tmux ? { meta: { tmux: record.tmux, identity: record.identity } } : {}),
		};
	}

	async attach(id: string, sessionId: string): Promise<SubagentAttachResult> {
		const record = await this.read(id, sessionId);
		if (!record) return { ok: false, reason: "not_found" };
		const target = tmuxTarget(record);
		if (!record.tmux || !target || !record.identity) return { ok: false, reason: "legacy_record", record };
		const workerMetadata = readWorkerMetadata(await readJsonObject(record.tmux.worker_metadata_file));
		if (!workerMetadata?.identity) return { ok: false, reason: "legacy_record", record, tmuxTarget: target };
		if (!tmuxRecordMatchesIdentity(record, workerMetadata.identity)) {
			return { ok: false, reason: "identity_mismatch", record, tmuxTarget: target };
		}
		if (!tmuxRecordMatchesIdentity(record, record.identity)) {
			return { ok: false, reason: "identity_mismatch", record, tmuxTarget: target };
		}
		return {
			ok: true,
			record,
			tmuxTarget: target,
			attachCommand: record.tmux.attach_command,
		};
	}

	async kill(id: string, sessionId: string): Promise<SubagentKillResult> {
		const record = await this.read(id, sessionId);
		if (!record) return { ok: false, reason: "not_found" };
		const target = tmuxTarget(record);
		if (isTerminalStatus(record.status)) return { ok: false, reason: "already_terminal", record, tmuxTarget: target };
		if (!record.tmux || !target || !record.identity) return { ok: false, reason: "legacy_record", record };
		if (!tmuxRecordMatchesIdentity(record, record.identity)) {
			return { ok: false, reason: "identity_mismatch", record, tmuxTarget: target };
		}
		const env = this.options.tmux?.env ?? process.env;
		const command = tmuxCommandFromMetadata(record.tmux, env.PI_TMUX_COMMAND?.trim() || "tmux");
		const spawn = this.options.tmux?.spawnSync ?? defaultTmuxSpawnSync;
		const hasTarget = spawn(command, tmuxHasTargetArgs(record.tmux.target), {
			cwd: record.cwd,
			env,
			stdin: "inherit",
			stdout: "inherit",
			stderr: "inherit",
		});
		if (hasTarget.exitCode !== 0) return { ok: false, reason: "tmux_pane_not_found", record, tmuxTarget: target };
		const workerMetadata = readWorkerMetadata(await readJsonObject(record.tmux.worker_metadata_file));
		if (!workerMetadata?.identity) return { ok: false, reason: "legacy_record", record, tmuxTarget: target };
		if (!tmuxRecordMatchesIdentity(record, workerMetadata.identity)) {
			return { ok: false, reason: "identity_mismatch", record, tmuxTarget: target };
		}
		if (!isWorkerPidAlive(workerMetadata)) {
			return { ok: false, reason: "worker_stale", record, tmuxTarget: target };
		}
		const killed = spawn(command, tmuxCleanupArgs(record.tmux.target), {
			cwd: record.cwd,
			env,
			stdin: "inherit",
			stdout: "inherit",
			stderr: "inherit",
		});
		if (killed.exitCode !== 0) return { ok: false, reason: "kill_failed", record, tmuxTarget: target };
		return { ok: true, record: await this.writeTerminal(record, "cancelled", sessionId), tmuxTarget: target };
	}

	async cancel(id: string, sessionId: string): Promise<SubagentRecord | undefined> {
		const live = this.live.get(id);
		if (live) live.controller.abort();
		const record = await this.read(id, sessionId);
		if (!record) return undefined;
		if (isTerminalStatus(record.status)) return record;
		return this.writeTerminal(record, "cancelled", sessionId);
	}

	/** Tear down the manager: abort all live subagents and clear the live map. Called by RuntimeOwner.stop(). */
	async dispose(): Promise<void> {
		for (const live of this.live.values()) {
			live.controller.abort();
		}
		this.live.clear();
	}
}
