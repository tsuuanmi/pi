import { spawnSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { SubagentTmuxTarget, ThinkingLevel } from "@tsuuanmi/pi-agent";
import { buildTmuxCommands, createSubagentRunIdentity } from "@tsuuanmi/pi-agent";
import { PI_SUBAGENT_TMUX_TARGET_KIND_ENV, PI_SUBAGENT_WORKER_REQUEST_ENV } from "#pi/cli/launch-tmux";
import { createAgentSessionServices } from "#pi/session/agent-session-services";
import { SubagentManager } from "#pi/subagents/subagents";

export class SubagentWorkerMetadataInvalidError extends Error {
	readonly code = "worker_metadata_invalid";

	constructor(message = "worker metadata is invalid") {
		super(message);
		this.name = "SubagentWorkerMetadataInvalidError";
	}
}

export interface SubagentWorkerRequestFile {
	version: 1;
	subagentId: string;
	storageSessionId: string;
	storageRoot: string;
	request: {
		prompt: string;
		role?: string;
		agent?: string;
		systemPrompt?: string;
		cwd?: string;
		tools?: string[];
		excludeTools?: string[];
		model?: string;
		thinkingLevel?: ThinkingLevel;
		persistent?: boolean;
		detached?: boolean;
		label?: string;
		parentSessionId?: string;
	};
}

function isStringArray(value: unknown): value is string[] {
	return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function optionalString(value: unknown, field: string): string | undefined {
	if (value === undefined) return undefined;
	if (typeof value !== "string") throw new SubagentWorkerMetadataInvalidError(`${field} must be a string`);
	return value;
}

function optionalBoolean(value: unknown, field: string): boolean | undefined {
	if (value === undefined) return undefined;
	if (typeof value !== "boolean") throw new SubagentWorkerMetadataInvalidError(`${field} must be a boolean`);
	return value;
}

function optionalThinkingLevel(value: unknown, field: string): ThinkingLevel | undefined {
	if (value === undefined) return undefined;
	if (
		value === "off" ||
		value === "minimal" ||
		value === "low" ||
		value === "medium" ||
		value === "high" ||
		value === "xhigh"
	)
		return value;
	throw new SubagentWorkerMetadataInvalidError(`${field} is invalid`);
}

function parseTmuxTarget(targetKind: "pane" | "session", raw: string | undefined): SubagentTmuxTarget {
	const fields = raw?.trim().split(/\s+/) ?? [];
	if (targetKind === "pane") {
		const [session_name, session_id, window_id, window_index, pane_id, pane_index] = fields;
		if (!session_name || !session_id || !window_id || !window_index || !pane_id || !pane_index) {
			throw new SubagentWorkerMetadataInvalidError(`tmux pane target metadata is invalid: ${raw ?? "<empty>"}`);
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
		throw new SubagentWorkerMetadataInvalidError(`tmux session target metadata is invalid: ${raw ?? "<empty>"}`);
	}
	return {
		kind: "session",
		session_name,
		session_id,
		target: `=${session_name}`,
	};
}

function detectCurrentTmuxTarget(targetKind: "pane" | "session"): SubagentTmuxTarget {
	const tmuxCommand = process.env.PI_TMUX_COMMAND?.trim() || "tmux";
	const format =
		targetKind === "pane"
			? "#{session_name}\t#{session_id}\t#{window_id}\t#{window_index}\t#{pane_id}\t#{pane_index}"
			: "#{session_name}\t#{session_id}";
	const result = spawnSync(tmuxCommand, ["display-message", "-p", "-F", format], {
		cwd: process.cwd(),
		env: process.env,
		stdio: ["ignore", "pipe", "pipe"],
	});
	if (result.status !== 0) {
		throw new SubagentWorkerMetadataInvalidError(
			result.stderr?.toString().trim() || "unable to determine current tmux target",
		);
	}
	return parseTmuxTarget(targetKind, result.stdout?.toString());
}

export async function readSubagentWorkerRequest(path: string): Promise<SubagentWorkerRequestFile> {
	let parsed: unknown;
	try {
		parsed = JSON.parse(await readFile(path, "utf8")) as unknown;
	} catch (error) {
		throw new SubagentWorkerMetadataInvalidError(error instanceof Error ? error.message : String(error));
	}
	if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
		throw new SubagentWorkerMetadataInvalidError("worker request must be an object");
	}
	const root = parsed as Record<string, unknown>;
	if (root.version !== 1) throw new SubagentWorkerMetadataInvalidError("unsupported worker request version");
	const subagentId = optionalString(root.subagentId, "subagentId");
	const storageSessionId = optionalString(root.storageSessionId, "storageSessionId");
	const storageRoot = optionalString(root.storageRoot, "storageRoot");
	if (!subagentId?.trim()) throw new SubagentWorkerMetadataInvalidError("subagentId is required");
	if (!storageSessionId?.trim()) throw new SubagentWorkerMetadataInvalidError("storageSessionId is required");
	if (!storageRoot?.trim()) throw new SubagentWorkerMetadataInvalidError("storageRoot is required");
	const requestValue = root.request;
	if (!requestValue || typeof requestValue !== "object" || Array.isArray(requestValue)) {
		throw new SubagentWorkerMetadataInvalidError("request must be an object");
	}
	const request = requestValue as Record<string, unknown>;
	const prompt = optionalString(request.prompt, "request.prompt");
	if (!prompt?.trim()) throw new SubagentWorkerMetadataInvalidError("request.prompt is required");
	const tools = request.tools === undefined ? undefined : request.tools;
	const excludeTools = request.excludeTools === undefined ? undefined : request.excludeTools;
	if (tools !== undefined && !isStringArray(tools)) {
		throw new SubagentWorkerMetadataInvalidError("request.tools must be string[]");
	}
	if (excludeTools !== undefined && !isStringArray(excludeTools)) {
		throw new SubagentWorkerMetadataInvalidError("request.excludeTools must be string[]");
	}
	return {
		version: 1,
		subagentId,
		storageSessionId,
		storageRoot,
		request: {
			prompt,
			role: optionalString(request.role, "request.role"),
			agent: optionalString(request.agent, "request.agent"),
			systemPrompt: optionalString(request.systemPrompt, "request.systemPrompt"),
			cwd: optionalString(request.cwd, "request.cwd"),
			tools,
			excludeTools,
			model: optionalString(request.model, "request.model"),
			thinkingLevel: optionalThinkingLevel(request.thinkingLevel, "request.thinkingLevel"),
			persistent: optionalBoolean(request.persistent, "request.persistent"),
			detached: optionalBoolean(request.detached, "request.detached"),
			label: optionalString(request.label, "request.label"),
			parentSessionId: optionalString(request.parentSessionId, "request.parentSessionId"),
		},
	};
}

export async function runSubagentWorkerRequest(path: string): Promise<void> {
	const worker = await readSubagentWorkerRequest(path);
	const targetKind = process.env[PI_SUBAGENT_TMUX_TARGET_KIND_ENV] === "session" ? "session" : "pane";
	const target = detectCurrentTmuxTarget(targetKind);
	const cwd = worker.storageRoot;
	const agentDir = process.env.PI_AGENT_DIR;
	const services = await createAgentSessionServices({ cwd, agentDir });
	const manager = new SubagentManager(services);
	const workerMetadataPath = join(dirname(path), "worker.json");
	const recordPath = join(dirname(path), "record.json");
	const artifactPath = join(dirname(path), "artifact.json");
	const identity = createSubagentRunIdentity({
		subagentId: worker.subagentId,
		parentSessionId: worker.request.parentSessionId ?? worker.storageSessionId,
		storageSessionId: worker.storageSessionId,
		storageRoot: worker.storageRoot,
		executionCwd: worker.request.cwd ?? worker.storageRoot,
		requestPath: path,
		recordPath,
		artifactPath,
		workerMetadataPath,
		lifecycleState: "running",
		cleanupEligible: true,
		tmux: {
			backend: "tmux",
			target,
			request_path: path,
			worker_metadata_path: workerMetadataPath,
		},
	});
	await writeFile(
		workerMetadataPath,
		`${JSON.stringify(
			{
				version: 1,
				subagentId: worker.subagentId,
				storageSessionId: worker.storageSessionId,
				storageRoot: worker.storageRoot,
				pid: process.pid,
				startedAt: new Date().toISOString(),
				requestPath: path,
				identity,
			},
			null,
			2,
		)}\n`,
		"utf8",
	);
	const commands = buildTmuxCommands(target, process.env.PI_TMUX_COMMAND?.trim() || "tmux");
	const tmux = {
		backend: "tmux" as const,
		session_name: target.session_name,
		target,
		request_file: path,
		worker_metadata_file: workerMetadataPath,
		attach_command: commands.attachCommand,
		inspect_command: commands.inspectCommand,
		cleanup_command: commands.cleanupCommand,
		visible_by_default: true,
	};
	const record = JSON.parse(await readFile(recordPath, "utf8")) as Record<string, unknown>;
	await writeFile(recordPath, `${JSON.stringify({ ...record, identity, tmux }, null, 2)}\n`, "utf8");
	await manager.runWorkerRequest(worker);
}

export async function runSubagentWorkerMain(args: string[]): Promise<boolean> {
	const requestPath = args[0] === "--subagent-worker" ? args[1] : process.env[PI_SUBAGENT_WORKER_REQUEST_ENV];
	if (!requestPath) return false;
	try {
		await runSubagentWorkerRequest(requestPath);
	} catch (error) {
		const code = error instanceof SubagentWorkerMetadataInvalidError ? error.code : "subagent_worker_failed";
		const message = error instanceof Error ? error.message : String(error);
		process.stderr.write(`${code}: ${message}\n`);
		process.exitCode = 1;
	}
	return true;
}
