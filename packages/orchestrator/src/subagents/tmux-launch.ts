import {
	commandAvailable,
	PI_TMUX_LAUNCHED_ENV,
	resolvePiCommand,
	resolveTmuxCommand,
	sanitizeTmuxToken,
	shellQuote,
} from "@tsuuanmi/pi/tmux";
export const PI_SUBAGENT_TMUX_TARGET_KIND_ENV = "PI_SUBAGENT_TMUX_TARGET_KIND";

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
	const workerArgs = ["subagent-worker", context.requestPath];
	const quoted = [...piCommand, ...workerArgs].map(shellQuote).join(" ");
	const targetKind = env.TMUX ? "pane" : "session";
	const innerCommand = `exec env ${PI_TMUX_LAUNCHED_ENV}=1 ${PI_SUBAGENT_TMUX_TARGET_KIND_ENV}=${shellQuote(targetKind)} ${quoted}`;
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
