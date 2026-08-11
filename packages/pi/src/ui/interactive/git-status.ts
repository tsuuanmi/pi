import { type ExecFileException, execFile } from "node:child_process";
import type { GitStatusSummary } from "@tsuuanmi/pi-tui";

/** Parse Git porcelain output into the status-line snapshot shape. */
export function parseGitStatus(text: string): GitStatusSummary {
	let staged = 0;
	let unstaged = 0;
	let untracked = 0;
	for (const line of text.split("\n")) {
		if (!line) continue;
		const indexStatus = line[0];
		const workTreeStatus = line[1];
		if (indexStatus === "?" && workTreeStatus === "?") {
			untracked += 1;
			continue;
		}
		if (indexStatus && indexStatus !== " " && indexStatus !== "?") staged += 1;
		if (workTreeStatus && workTreeStatus !== " ") unstaged += 1;
	}
	return { staged, unstaged, untracked };
}

/** Read one repository status snapshot without throwing through the UI data path. */
export function readGitStatus(cwd: string): Promise<GitStatusSummary | null> {
	return new Promise((resolve) => {
		execFile(
			"git",
			["--no-optional-locks", "status", "--porcelain"],
			{ cwd, encoding: "utf8", maxBuffer: 10 * 1024 * 1024 },
			(error: ExecFileException | null, stdout: string) => {
				resolve(error ? null : parseGitStatus(stdout));
			},
		);
	});
}
