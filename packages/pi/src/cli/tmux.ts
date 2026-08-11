import { spawnSync } from "node:child_process";
import * as path from "node:path";

export const PI_TMUX_LAUNCHED_ENV = "PI_TMUX_LAUNCHED";

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
