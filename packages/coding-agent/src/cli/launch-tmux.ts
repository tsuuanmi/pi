import { spawnSync } from "node:child_process";
import * as path from "node:path";
import type { Args } from "./args.ts";

const PI_DEFAULT_TMUX_SESSION = "pi";
const PI_TMUX_SESSION_PREFIX = `${PI_DEFAULT_TMUX_SESSION}_`;
const PI_TMUX_COMMAND_ENV = "PI_TMUX_COMMAND";
const PI_TMUX_PROFILE_ENV = "PI_TMUX_PROFILE";
const PI_TMUX_MOUSE_ENV = "PI_MOUSE";
const PI_TMUX_LAUNCHED_ENV = "PI_TMUX_LAUNCHED";
const PI_LAUNCH_POLICY_ENV = "PI_LAUNCH_POLICY";
const PI_TMUX_WINDOW_LABEL_MAX_WIDTH = 48;

const PI_TMUX_PROFILE_OPTION = "@pi-profile";
const PI_TMUX_PROFILE_VALUE = "1";
const PI_TMUX_BRANCH_OPTION = "@pi-branch";
const PI_TMUX_BRANCH_SLUG_OPTION = "@pi-branch-slug";
const PI_TMUX_PROJECT_OPTION = "@pi-project";

type LaunchPolicy = "direct" | "tmux";

interface TtyState {
	stdin: boolean;
	stdout: boolean;
}

export interface TmuxLaunchContext {
	parsed: Args;
	rawArgs: string[];
	cwd?: string;
	env?: NodeJS.ProcessEnv;
	argv?: string[];
	execPath?: string;
	platform?: NodeJS.Platform;
	tty?: TtyState;
	spawnSync?: TmuxSpawnSync;
	tmuxAvailable?: boolean;
	currentBranch?: string | null;
	project?: string | null;
	diagnosticWriter?: (message: string) => void;
}

export interface TmuxSpawnResult {
	exitCode: number | null;
	signalCode?: NodeJS.Signals | null;
	stderr?: string;
}

export type TmuxSpawnSync = (command: string, args: string[], options: TmuxSpawnOptions) => TmuxSpawnResult;

export interface TmuxSpawnOptions {
	cwd: string;
	env: NodeJS.ProcessEnv;
	stdin: "inherit";
	stdout: "inherit";
	stderr: "inherit";
}

export interface TmuxLaunchPlan {
	tmuxCommand: string;
	sessionName: string;
	cwd: string;
	innerCommand: string;
	newSessionArgs: string[];
	branch?: string | null;
	project?: string | null;
}

interface TmuxProfileCommand {
	description: string;
	args: string[];
}

function envDisabled(value: string | undefined): boolean {
	const normalized = value?.trim().toLowerCase();
	return normalized === "0" || normalized === "false" || normalized === "off" || normalized === "no";
}

function parseLaunchPolicy(env: NodeJS.ProcessEnv): LaunchPolicy {
	const raw = env[PI_LAUNCH_POLICY_ENV]?.trim().toLowerCase();
	if (raw === "direct" || raw === "tmux") return raw;
	if (env.PI_NO_TMUX === "1" || env.PI_NO_TMUX === "true") return "direct";
	return "tmux";
}

function isInteractiveRootLaunch(parsed: Args, tty: TtyState): boolean {
	return (
		tty.stdin &&
		tty.stdout &&
		!parsed.help &&
		!parsed.version &&
		!parsed.print &&
		parsed.mode === undefined &&
		parsed.listModels === undefined
	);
}

function shellQuote(value: string): string {
	if (value.length === 0) return "''";
	return `'${value.replace(/'/g, `'\\''`)}'`;
}

function isBunVirtualPath(value: string | undefined): boolean {
	return value?.startsWith("/$bunfs/") === true;
}

function resolveCurrentPiCommand(context: { cwd: string; argv: string[]; execPath: string }): string[] {
	const entrypoint = context.argv[1];
	if (!entrypoint) return ["pi"];
	if (isBunVirtualPath(entrypoint)) {
		return isBunVirtualPath(context.execPath) ? ["pi"] : [context.execPath];
	}
	const resolvedEntrypoint = path.isAbsolute(entrypoint) ? entrypoint : path.resolve(context.cwd, entrypoint);
	if (entrypoint.endsWith(".ts") || entrypoint.endsWith(".js") || entrypoint.endsWith(".mjs")) {
		return [context.execPath, resolvedEntrypoint];
	}
	return [resolvedEntrypoint];
}

function buildInnerCommand(context: { cwd: string; argv: string[]; execPath: string }, rawArgs: string[]): string {
	const command = resolveCurrentPiCommand(context);
	const quoted = [...command, ...rawArgs].map(shellQuote).join(" ");
	return `exec env ${PI_TMUX_LAUNCHED_ENV}=1 ${quoted}`;
}

function sanitizeTmuxToken(value: string): string {
	return (
		value
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/-+/g, "-")
			.replace(/^-|-$/g, "") || "default"
	);
}

function buildPiTmuxSessionSlug(value: string): string {
	return sanitizeTmuxToken(value);
}

function buildPiTmuxSessionName(
	env: NodeJS.ProcessEnv = process.env,
	context: { branch?: string | null; now?: number; id?: string } = {},
): string {
	const explicit = env.PI_TMUX_SESSION?.trim();
	if (explicit) return explicit;
	const timestamp = (context.now ?? Date.now()).toString(36);
	const id = context.id ?? Math.random().toString(36).slice(2, 10);
	const branchSlug = context.branch ? `${buildPiTmuxSessionSlug(context.branch)}_` : "";
	return `${PI_TMUX_SESSION_PREFIX}${branchSlug}${timestamp}_${id}`;
}

function visibleWidth(value: string): number {
	return Array.from(value).length;
}

function truncateVisible(value: string, maxWidth: number): string {
	if (maxWidth <= 0) return "";
	if (visibleWidth(value) <= maxWidth) return value;
	if (maxWidth === 1) return "…";
	return `${Array.from(value)
		.slice(0, maxWidth - 1)
		.join("")}…`;
}

function truncateVisibleTail(value: string, maxWidth: number): string {
	if (maxWidth <= 0) return "";
	if (visibleWidth(value) <= maxWidth) return value;
	if (maxWidth === 1) return "…";
	return `…${Array.from(value)
		.slice(-(maxWidth - 1))
		.join("")}`;
}

export function buildPiTmuxWindowTitle(cwd: string, branch: string | null | undefined): string {
	const project = path.basename(path.resolve(cwd)) || "pi";
	const trimmedBranch = branch?.trim();
	if (!trimmedBranch) return truncateVisible(project, PI_TMUX_WINDOW_LABEL_MAX_WIDTH);

	const fullTitle = `${project}:${trimmedBranch}`;
	if (visibleWidth(fullTitle) <= PI_TMUX_WINDOW_LABEL_MAX_WIDTH) return fullTitle;

	const remainingBranchWidth = PI_TMUX_WINDOW_LABEL_MAX_WIDTH - visibleWidth(project) - 1;
	if (remainingBranchWidth <= 0) return truncateVisible(project, PI_TMUX_WINDOW_LABEL_MAX_WIDTH);
	return `${project}:${truncateVisibleTail(trimmedBranch, remainingBranchWidth)}`;
}

function resolvePiTmuxCommand(env: NodeJS.ProcessEnv = process.env): string {
	return env[PI_TMUX_COMMAND_ENV]?.trim() || "tmux";
}

function commandAvailable(command: string): boolean {
	const result = spawnSync("sh", ["-c", `command -v -- ${shellQuote(command)}`], { stdio: "ignore" });
	return result.status === 0;
}

function readCurrentBranch(cwd: string): string | null {
	try {
		const result = spawnSync("git", ["symbolic-ref", "--quiet", "--short", "HEAD"], {
			cwd,
			encoding: "utf8",
			stdio: ["ignore", "pipe", "ignore"],
		});
		if (result.status !== 0) return null;
		return result.stdout.trim() || null;
	} catch {
		return null;
	}
}

function buildPiTmuxProfileCommands(
	target: string,
	env: NodeJS.ProcessEnv,
	metadata: { branch?: string | null; branchSlug?: string | null; project?: string | null },
): TmuxProfileCommand[] {
	const commands: TmuxProfileCommand[] = [
		{
			description: "mark pi tmux ownership",
			args: ["set-option", "-t", target, PI_TMUX_PROFILE_OPTION, PI_TMUX_PROFILE_VALUE],
		},
	];
	if (metadata.branch)
		commands.push({
			description: "record pi branch identity",
			args: ["set-option", "-t", target, PI_TMUX_BRANCH_OPTION, metadata.branch],
		});
	if (metadata.branchSlug)
		commands.push({
			description: "record pi branch slug",
			args: ["set-option", "-t", target, PI_TMUX_BRANCH_SLUG_OPTION, metadata.branchSlug],
		});
	if (metadata.project)
		commands.push({
			description: "record pi project identity",
			args: ["set-option", "-t", target, PI_TMUX_PROJECT_OPTION, metadata.project],
		});
	if (envDisabled(env[PI_TMUX_PROFILE_ENV])) return commands;
	commands.push(
		{ description: "enable tmux clipboard integration", args: ["set-option", "-t", target, "set-clipboard", "on"] },
		{
			description: "make copy-mode selection readable",
			args: ["set-window-option", "-t", target, "mode-style", "fg=colour231,bg=colour60"],
		},
	);
	if (!envDisabled(env[PI_TMUX_MOUSE_ENV])) {
		commands.unshift({
			description: "enable tmux mouse scrolling",
			args: ["set-option", "-t", target, "mouse", "on"],
		});
	}
	return commands;
}

function defaultSpawnSync(command: string, args: string[], options: TmuxSpawnOptions): TmuxSpawnResult {
	const result = spawnSync(command, args, {
		cwd: options.cwd,
		env: options.env,
		stdio: [options.stdin, options.stdout, options.stderr],
	});
	return { exitCode: result.status, signalCode: result.signal, stderr: result.stderr?.toString() };
}

function renameTmuxWindow(
	tmuxCommand: string,
	title: string,
	spawn: TmuxSpawnSync,
	options: TmuxSpawnOptions,
	target?: string,
): void {
	const args = target ? ["rename-window", "-t", target, "--", title] : ["rename-window", "--", title];
	spawn(tmuxCommand, args, options);
}

function renameExistingTmuxWindowIfNeeded(context: TmuxLaunchContext): void {
	const env = context.env ?? process.env;
	if (!env.TMUX || env[PI_TMUX_LAUNCHED_ENV] === "1") return;
	if (parseLaunchPolicy(env) === "direct") return;
	if ((context.platform ?? process.platform) === "win32") return;
	const tty = context.tty ?? { stdin: Boolean(process.stdin.isTTY), stdout: Boolean(process.stdout.isTTY) };
	if (!isInteractiveRootLaunch(context.parsed, tty)) return;
	const tmuxCommand = resolvePiTmuxCommand(env);
	if (!(context.tmuxAvailable ?? commandAvailable(tmuxCommand))) return;
	const cwd = context.cwd ?? process.cwd();
	const branch = context.currentBranch ?? readCurrentBranch(cwd);
	renameTmuxWindow(
		tmuxCommand,
		buildPiTmuxWindowTitle(context.project ?? cwd, branch),
		context.spawnSync ?? defaultSpawnSync,
		{
			cwd,
			env,
			stdin: "inherit",
			stdout: "inherit",
			stderr: "inherit",
		},
	);
}

export function buildDefaultTmuxLaunchPlan(context: TmuxLaunchContext): TmuxLaunchPlan | undefined {
	const env = context.env ?? process.env;
	if (!context.parsed.tmux || parseLaunchPolicy(env) === "direct") return undefined;
	if (env.TMUX || env[PI_TMUX_LAUNCHED_ENV] === "1") return undefined;
	if ((context.platform ?? process.platform) === "win32") return undefined;
	const tty = context.tty ?? { stdin: Boolean(process.stdin.isTTY), stdout: Boolean(process.stdout.isTTY) };
	if (!isInteractiveRootLaunch(context.parsed, tty)) return undefined;
	const cwd = context.cwd ?? process.cwd();
	const branch = context.currentBranch ?? readCurrentBranch(cwd);
	const tmuxCommand = resolvePiTmuxCommand(env);
	if (!(context.tmuxAvailable ?? commandAvailable(tmuxCommand))) return undefined;
	const sessionName = buildPiTmuxSessionName(env, { branch });
	const innerCommand = buildInnerCommand(
		{ cwd, argv: context.argv ?? process.argv, execPath: context.execPath ?? process.execPath },
		context.rawArgs,
	);
	return {
		tmuxCommand,
		sessionName,
		cwd,
		innerCommand,
		newSessionArgs: ["new-session", "-d", "-s", sessionName, "-c", cwd, innerCommand],
		branch,
		project: context.project ?? cwd,
	};
}

function formatTmuxLaunchDiagnostic(stage: string, stderr?: string): string {
	const detail = stderr?.trim();
	const suffix = detail ? ` ${detail.slice(0, 240)}` : "";
	return `pi --tmux failed after creating tmux session: ${stage}.${suffix}\n`;
}

export function launchDefaultTmuxIfNeeded(context: TmuxLaunchContext): boolean {
	renameExistingTmuxWindowIfNeeded(context);
	const plan = buildDefaultTmuxLaunchPlan(context);
	if (!plan) return false;
	const env = context.env ?? process.env;
	const spawn = context.spawnSync ?? defaultSpawnSync;
	const options: TmuxSpawnOptions = { cwd: plan.cwd, env, stdin: "inherit", stdout: "inherit", stderr: "inherit" };
	const created = spawn(plan.tmuxCommand, plan.newSessionArgs, options);
	if (created.exitCode !== 0) return false;
	renameTmuxWindow(
		plan.tmuxCommand,
		buildPiTmuxWindowTitle(plan.project ?? plan.cwd, plan.branch),
		spawn,
		options,
		`=${plan.sessionName}`,
	);
	const failures: Array<{ command: TmuxProfileCommand; stderr?: string }> = [];
	for (const command of buildPiTmuxProfileCommands(plan.sessionName, env, {
		branch: plan.branch,
		branchSlug: plan.branch ? buildPiTmuxSessionSlug(plan.branch) : null,
		project: plan.project,
	})) {
		const result = spawn(plan.tmuxCommand, command.args, options);
		if (result.exitCode !== 0) failures.push({ command, stderr: result.stderr });
	}
	if (failures.length > 0) {
		spawn(plan.tmuxCommand, ["kill-session", "-t", `=${plan.sessionName}`], options);
		(context.diagnosticWriter ?? ((message: string) => process.stderr.write(message)))(
			formatTmuxLaunchDiagnostic("profile tagging failed", failures[0]?.stderr),
		);
		return true;
	}
	const attached = spawn(plan.tmuxCommand, ["attach-session", "-t", plan.sessionName], options);
	if (attached.exitCode === 0) return true;
	(context.diagnosticWriter ?? ((message: string) => process.stderr.write(message)))(
		formatTmuxLaunchDiagnostic("attach failed", attached.stderr),
	);
	return true;
}
