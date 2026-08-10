import { spawnSync } from "node:child_process";
import * as path from "node:path";

export const PI_TMUX_LAUNCHED_ENV = "PI_TMUX_LAUNCHED";
export const PI_SUBAGENT_WORKER_REQUEST_ENV = "PI_SUBAGENT_WORKER_REQUEST";
export const PI_SUBAGENT_TMUX_TARGET_KIND_ENV = "PI_SUBAGENT_TMUX_TARGET_KIND";

export interface TmuxSpawnResult {
	exitCode: number | null;
	signalCode?: NodeJS.Signals | null;
	stdout?: string;
	stderr?: string;
}

export type TmuxSpawnSync = (command: string, args: string[], options: TmuxSpawnOptions) => TmuxSpawnResult;

export interface TmuxSpawnOptions {
	cwd: string;
	env: NodeJS.ProcessEnv;
	stdin: "inherit";
	stdout: "inherit" | "pipe";
	stderr: "inherit";
}

export interface TmuxSubagentLaunchContext {
	cwd: string;
	subagentId: string;
	requestPath: string;
	env?: NodeJS.ProcessEnv;
	argv?: string[];
	execPath?: string;
	tmuxCommand?: string;
	sessionName?: string;
}

export interface TmuxSubagentLaunchPlan {
	tmuxCommand: string;
	sessionName: string;
	cwd: string;
	requestPath: string;
	innerCommand: string;
	launchArgs: string[];
	attachCommand: string;
	inspectCommand: string;
	cleanupCommand: string;
	visibleByDefault: boolean;
}

export function buildTmuxSubagentLaunchPlan(context: TmuxSubagentLaunchContext): TmuxSubagentLaunchPlan {
	const env = context.env ?? process.env;
	const tmuxCommand = context.tmuxCommand ?? resolveTmuxCommand(env);
	const sessionName = context.sessionName ?? `pi-worker-${sanitizeTmuxToken(context.subagentId)}`;
	const piCommand = resolvePiCommand({
		cwd: context.cwd,
		argv: context.argv ?? process.argv,
		execPath: context.execPath ?? process.execPath,
	});
	const workerArgs = ["--subagent-worker", context.requestPath];
	const quoted = [...piCommand, ...workerArgs].map(shellQuote).join(" ");
	const targetKind = env.TMUX ? "pane" : "session";
	const innerCommand = `exec env ${PI_TMUX_LAUNCHED_ENV}=1 ${PI_SUBAGENT_TMUX_TARGET_KIND_ENV}=${shellQuote(targetKind)} ${PI_SUBAGENT_WORKER_REQUEST_ENV}=${shellQuote(
		context.requestPath,
	)} ${quoted}`;
	const launchArgs = env.TMUX
		? [
				"split-window",
				"-v",
				"-c",
				context.cwd,
				"-P",
				"-F",
				"#{session_name}\t#{session_id}\t#{window_id}\t#{window_index}\t#{pane_id}\t#{pane_index}",
				innerCommand,
			]
		: [
				"new-session",
				"-d",
				"-s",
				sessionName,
				"-c",
				context.cwd,
				"-P",
				"-F",
				"#{session_name}\t#{session_id}",
				innerCommand,
			];

	return {
		tmuxCommand,
		sessionName,
		cwd: context.cwd,
		requestPath: context.requestPath,
		innerCommand,
		launchArgs,
		attachCommand: `${tmuxCommand} attach-session -t ${sessionName}`,
		inspectCommand: `${tmuxCommand} list-panes -a -F '#{session_name}:#{window_index}.#{pane_index} #{pane_current_command}'`,
		cleanupCommand: `${tmuxCommand} kill-session -t ${sessionName}`,
		visibleByDefault: true,
	};
}

export function isTmuxCommandAvailable(command: string): boolean {
	return commandAvailable(command);
}

export function resolvePiCommand(context: {
	cwd: string;
	argv: string[];
	execPath: string;
	execArgv?: string[];
}): string[] {
	const entrypoint = context.argv[1];
	if (!entrypoint) return ["pi"];
	const resolvedEntrypoint = path.isAbsolute(entrypoint) ? entrypoint : path.resolve(context.cwd, entrypoint);
	if (entrypoint.endsWith(".ts") || entrypoint.endsWith(".js") || entrypoint.endsWith(".mjs")) {
		return [context.execPath, ...(context.execArgv ?? process.execArgv), resolvedEntrypoint];
	}
	return [resolvedEntrypoint];
}

export function resolveTmuxCommand(env: NodeJS.ProcessEnv = process.env): string {
	return env.PI_TMUX_COMMAND?.trim() || "tmux";
}

export function sanitizeTmuxToken(value: string): string {
	return (
		value
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/-+/g, "-")
			.replace(/^-|-$/g, "") || "default"
	);
}

export function shellQuote(value: string): string {
	if (value.length === 0) return "''";
	return `'${value.replace(/'/g, `'\\''`)}'`;
}

export function commandAvailable(command: string): boolean {
	const result = spawnSync("sh", ["-c", `command -v -- ${shellQuote(command)}`], { stdio: "ignore" });
	return result.status === 0;
}
