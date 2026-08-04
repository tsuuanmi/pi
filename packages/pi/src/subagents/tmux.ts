export interface TmuxPaneTarget {
	kind: "pane";
	session_name: string;
	session_id: string;
	window_id: string;
	window_index: number;
	pane_id: string;
	pane_index: number;
	target: string;
}

export interface TmuxSessionTarget {
	kind: "session";
	session_name: string;
	session_id: string;
	target: string;
}

export type TmuxTarget = TmuxPaneTarget | TmuxSessionTarget;

export interface TmuxMetadata {
	backend: "tmux";
	session_name: string;
	target: TmuxTarget;
	request_file: string;
	worker_metadata_file: string;
	attach_command: string;
	inspect_command: string;
	cleanup_command: string;
	visible_by_default: boolean;
}

export function buildTmuxCommands(
	target: TmuxTarget,
	tmuxCommand: string,
): {
	attachCommand: string;
	inspectCommand: string;
	cleanupCommand: string;
} {
	const attachCommand =
		target.kind === "pane"
			? `${tmuxCommand} select-pane -t ${target.target}`
			: `${tmuxCommand} attach-session -t ${target.target}`;
	const inspectCommand =
		target.kind === "pane"
			? `${tmuxCommand} list-panes -t ${target.session_name} -F '#{pane_id} #{pane_index} #{pane_current_command}'`
			: `${tmuxCommand} list-sessions -F '#{session_name} #{session_id} #{session_windows}'`;
	const cleanupCommand =
		target.kind === "pane"
			? `${tmuxCommand} kill-pane -t ${target.target}`
			: `${tmuxCommand} kill-session -t ${target.target}`;
	return { attachCommand, inspectCommand, cleanupCommand };
}
