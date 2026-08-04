import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { SubagentStatus } from "@tsuuanmi/pi-agent";
import { withFileMutationQueue } from "@tsuuanmi/pi-agent/node";
import { createRunIdentity, isRunIdentity, type RunIdentity, recordMatchesIdentity } from "#pi/subagents/run-identity";
import { buildTmuxCommands, type TmuxMetadata, type TmuxTarget } from "#pi/subagents/tmux";
import {
	buildTmuxSubagentLaunchPlan,
	isTmuxCommandAvailable,
	resolveTmuxCommand,
	type TmuxSpawnSync,
} from "#pi/subagents/tmux-launch";
import type {
	AttachResult,
	InspectResult,
	KillResult,
	ResolvedSubagentRequest,
	SubagentRecord,
	SubagentRunResult,
	WorkerRequest,
} from "#pi/subagents/types";

export interface TmuxBackendOptions {
	available?: (command: string) => boolean;
	spawnSync?: TmuxSpawnSync;
	env?: NodeJS.ProcessEnv;
	argv?: string[];
	execPath?: string;
	sessionName?: string;
}

interface TmuxStorage {
	storageRoot: string;
	recordPath(id: string, sessionId: string): string;
	read(id: string, sessionId: string): Promise<SubagentRecord | undefined>;
	writeRecord(record: SubagentRecord, sessionId: string): Promise<SubagentRecord>;
	writeTerminal(
		record: SubagentRecord,
		status: SubagentStatus,
		sessionId: string,
		extra?: Partial<SubagentRecord>,
	): Promise<SubagentRecord>;
}

interface SubagentWorkerMetadata {
	version: 1;
	subagentId: string;
	storageSessionId: string;
	storageRoot: string;
	pid: number;
	startedAt: string;
	requestPath: string;
	identity?: RunIdentity;
}

class TmuxUnavailableError extends Error {
	readonly code = "tmux_unavailable";
	readonly backendKind = "tmux" as const;

	constructor(message = "tmux backend unavailable") {
		super(message);
		this.name = "TmuxUnavailableError";
	}
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

async function writeJsonAtomic(path: string, value: object): Promise<void> {
	await withFileMutationQueue(path, async () => {
		await mkdir(dirname(path), { recursive: true });
		const tempPath = `${path}.${process.pid}.${Date.now()}.${randomUUID()}.tmp`;
		await writeFile(tempPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
		await rename(tempPath, path);
	});
}

function parseLaunchTarget(output: string | undefined, targetKind: "pane" | "session"): TmuxTarget {
	const fields = output?.trim().split(/\s+/) ?? [];
	if (targetKind === "pane") {
		const [session_name, session_id, window_id, windowIndex, pane_id, paneIndex] = fields;
		const window_index = Number(windowIndex);
		const pane_index = Number(paneIndex);
		if (
			!session_name ||
			!session_id ||
			!window_id ||
			!pane_id ||
			!Number.isInteger(window_index) ||
			!Number.isInteger(pane_index)
		) {
			throw new Error(`tmux split-window did not return pane target metadata: ${output ?? "<empty>"}`);
		}
		return {
			kind: "pane",
			session_name,
			session_id,
			window_id,
			window_index,
			pane_id,
			pane_index,
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

function tmuxMetadata(
	target: TmuxTarget,
	requestPath: string,
	workerMetadataFile: string,
	tmuxCommand: string,
): TmuxMetadata {
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
		visible_by_default: true,
	};
}

function readWorkerMetadata(metadata: Record<string, unknown> | undefined): SubagentWorkerMetadata | undefined {
	if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return undefined;
	const root = metadata as Record<string, unknown>;
	if (root.version !== 1) return undefined;
	if (typeof root.subagentId !== "string" || typeof root.storageSessionId !== "string") return undefined;
	if (typeof root.storageRoot !== "string" || typeof root.pid !== "number" || typeof root.startedAt !== "string") {
		return undefined;
	}
	if (typeof root.requestPath !== "string") return undefined;
	const identity = root.identity;
	if (identity !== undefined && !isRunIdentity(identity)) return undefined;
	return {
		version: 1,
		subagentId: root.subagentId,
		storageSessionId: root.storageSessionId,
		storageRoot: root.storageRoot,
		pid: root.pid,
		startedAt: root.startedAt,
		requestPath: root.requestPath,
		identity,
	};
}

function isWorkerPidAlive(metadata: Pick<SubagentWorkerMetadata, "pid"> | undefined): boolean {
	const pid = metadata?.pid;
	if (typeof pid !== "number" || !Number.isInteger(pid) || pid <= 0) return false;
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
}

function targetFor(record: SubagentRecord): string | undefined {
	return record.identity?.tmux.target.target;
}

function commandFor(tmux: TmuxMetadata): string | undefined {
	const command = tmux.cleanup_command.split(/\s+/, 1)[0]?.trim();
	return command || undefined;
}

function targetExistsArgs(target: TmuxTarget): string[] {
	return target.kind === "pane"
		? ["display-message", "-p", "-t", target.target, "#{pane_id}"]
		: ["has-session", "-t", target.target];
}

function cleanupArgs(target: TmuxTarget): [string, string, string] {
	return target.kind === "pane" ? ["kill-pane", "-t", target.target] : ["kill-session", "-t", target.target];
}

function isTerminalStatus(status: SubagentRecord["status"]): boolean {
	return status === "completed" || status === "failed" || status === "cancelled";
}

export class TmuxBackend {
	private readonly storage: TmuxStorage;
	private readonly options: TmuxBackendOptions;

	constructor(storage: TmuxStorage, options: TmuxBackendOptions = {}) {
		this.storage = storage;
		this.options = options;
	}

	async spawn(
		id: string,
		request: ResolvedSubagentRequest,
		storageSessionId: string,
		now: string,
		artifactFile: string,
		promptHash: string,
	): Promise<SubagentRunResult> {
		const env = this.options.env ?? process.env;
		const tmuxCommand = resolveTmuxCommand(env);
		const available = this.options.available ?? isTmuxCommandAvailable;
		if (!available(tmuxCommand)) throw new TmuxUnavailableError(`tmux command not available: ${tmuxCommand}`);
		const executionCwd = request.cwd ?? this.storage.storageRoot;
		const workerDir = dirname(this.storage.recordPath(id, storageSessionId));
		const requestPath = join(workerDir, "request.json");
		const workerMetadataFile = join(workerDir, "worker.json");
		const plan = buildTmuxSubagentLaunchPlan({
			cwd: executionCwd,
			subagentId: id,
			requestPath,
			env,
			argv: this.options.argv,
			execPath: this.options.execPath,
			tmuxCommand,
			sessionName: this.options.sessionName,
		});
		const workerRequest: WorkerRequest = {
			version: 1,
			subagentId: id,
			storageSessionId,
			storageRoot: this.storage.storageRoot,
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
		};
		await writeJsonAtomic(requestPath, workerRequest);
		const provisionalRecord = await this.storage.writeRecord(
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
				last_prompt_sha256: promptHash,
				artifact_file: artifactFile,
			},
			storageSessionId,
		);
		const spawn = this.options.spawnSync ?? defaultTmuxSpawnSync;
		const launched = spawn(plan.tmuxCommand, plan.launchArgs, {
			cwd: plan.cwd,
			env,
			stdin: "inherit",
			stdout: "pipe",
			stderr: "inherit",
		});
		if (launched.exitCode !== 0) {
			const failed = await this.storage.writeTerminal(provisionalRecord, "failed", storageSessionId, {
				error_text: launched.stderr?.trim() || "tmux worker launch failed",
			});
			return { record: failed, messages: [], output: failed.error_text ?? "" };
		}
		const targetKind = plan.launchArgs[0] === "split-window" ? "pane" : "session";
		let target: TmuxTarget;
		try {
			target = parseLaunchTarget(launched.stdout, targetKind);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			const failed = await this.storage.writeTerminal(provisionalRecord, "failed", storageSessionId, {
				error_text: message,
			});
			return { record: failed, messages: [], output: failed.error_text ?? "" };
		}
		const tmux = tmuxMetadata(target, requestPath, workerMetadataFile, tmuxCommand);
		const identity = createRunIdentity({
			subagentId: id,
			parentSessionId: request.parentSessionId ?? storageSessionId,
			storageSessionId,
			storageRoot: this.storage.storageRoot,
			executionCwd,
			requestPath,
			recordPath: this.storage.recordPath(id, storageSessionId),
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
		const record = await this.storage.writeRecord(
			{
				...provisionalRecord,
				identity,
				tmux,
			},
			storageSessionId,
		);
		return {
			record: (await this.storage.read(id, storageSessionId)) ?? record,
			messages: [],
			output: launched.stdout?.trim() ?? "",
		};
	}

	inspect(record: SubagentRecord): Pick<InspectResult, "workerMetadataPath" | "meta"> {
		return {
			workerMetadataPath: record.tmux?.worker_metadata_file,
			...(record.tmux ? { meta: { tmux: record.tmux, identity: record.identity } } : {}),
		};
	}

	async attach(record: SubagentRecord): Promise<AttachResult> {
		const target = targetFor(record);
		if (!record.tmux || !target || !record.identity) return { ok: false, reason: "invalid_identity", record };
		const workerMetadata = readWorkerMetadata(await readJsonObject(record.tmux.worker_metadata_file));
		if (!workerMetadata?.identity) return { ok: false, reason: "invalid_identity", record, tmuxTarget: target };
		if (!recordMatchesIdentity(record, workerMetadata.identity)) {
			return { ok: false, reason: "identity_mismatch", record, tmuxTarget: target };
		}
		if (!recordMatchesIdentity(record, record.identity)) {
			return { ok: false, reason: "identity_mismatch", record, tmuxTarget: target };
		}
		const attachCommand = record.tmux.attach_command?.trim();
		if (!attachCommand) return { ok: false, reason: "invalid_metadata", record, tmuxTarget: target };
		return {
			ok: true,
			record,
			tmuxTarget: target,
			attachCommand,
		};
	}

	async kill(record: SubagentRecord, sessionId: string): Promise<KillResult> {
		const target = targetFor(record);
		if (isTerminalStatus(record.status)) return { ok: false, reason: "already_terminal", record, tmuxTarget: target };
		if (!record.tmux || !target || !record.identity) return { ok: false, reason: "invalid_identity", record };
		if (!recordMatchesIdentity(record, record.identity)) {
			return { ok: false, reason: "identity_mismatch", record, tmuxTarget: target };
		}
		const env = this.options.env ?? process.env;
		const command = commandFor(record.tmux);
		if (!command) return { ok: false, reason: "invalid_metadata", record, tmuxTarget: target };
		const spawn = this.options.spawnSync ?? defaultTmuxSpawnSync;
		const hasTarget = spawn(command, targetExistsArgs(record.tmux.target), {
			cwd: record.cwd,
			env,
			stdin: "inherit",
			stdout: "inherit",
			stderr: "inherit",
		});
		if (hasTarget.exitCode !== 0) return { ok: false, reason: "tmux_pane_not_found", record, tmuxTarget: target };
		const workerMetadata = readWorkerMetadata(await readJsonObject(record.tmux.worker_metadata_file));
		if (!workerMetadata?.identity) return { ok: false, reason: "invalid_identity", record, tmuxTarget: target };
		if (!recordMatchesIdentity(record, workerMetadata.identity)) {
			return { ok: false, reason: "identity_mismatch", record, tmuxTarget: target };
		}
		if (!isWorkerPidAlive(workerMetadata)) {
			return { ok: false, reason: "worker_stale", record, tmuxTarget: target };
		}
		const killed = spawn(command, cleanupArgs(record.tmux.target), {
			cwd: record.cwd,
			env,
			stdin: "inherit",
			stdout: "inherit",
			stderr: "inherit",
		});
		if (killed.exitCode !== 0) return { ok: false, reason: "kill_failed", record, tmuxTarget: target };
		return { ok: true, record: await this.storage.writeTerminal(record, "cancelled", sessionId), tmuxTarget: target };
	}
}
