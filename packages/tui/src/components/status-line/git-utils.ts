import { type ExecFileException, execFile } from "node:child_process";

export interface GitStatusSummary {
	staged: number;
	unstaged: number;
	untracked: number;
}

/**
 * Parse `git status --porcelain` output into staged/unstaged/untracked counts.
 *
 * Counting rules (ported from gajae-code `utils/git.ts:685`):
 * - `??` (untracked) counts as 1 untracked and does NOT count toward
 *   staged/unstaged (it is not yet tracked by git).
 * - The first column (`x`) not space/`?` counts as 1 staged (includes renames
 *   `R `, which are 1 staged, and copies `C `).
 * - The second column (`y`) not space counts as 1 unstaged.
 *
 * A single file can contribute to both staged and unstaged (e.g. `MM`).
 */
export function parseStatusPorcelain(text: string): GitStatusSummary {
	let staged = 0;
	let unstaged = 0;
	let untracked = 0;
	for (const line of text.split("\n")) {
		if (!line) continue;
		const x = line[0];
		const y = line[1];
		if (x === "?" && y === "?") {
			untracked += 1;
			continue;
		}
		if (x && x !== " " && x !== "?") staged += 1;
		if (y && y !== " ") unstaged += 1;
	}
	return { staged, unstaged, untracked };
}

/**
 * Run `git status --porcelain` in `cwd` and parse the counts.
 *
 * Catches every failure mode and returns `null` so the render path never
 * throws. Failures include: git binary missing (ENOENT),
 * permission errors (EACCES), non-zero exit (e.g. inside a corrupt repo), and
 * a non-git cwd (`.git` absent). The caller renders an empty/branch-only git
 * segment when the result is `null`.
 */
export function runGitStatusPorcelain(cwd: string): Promise<GitStatusSummary | null> {
	return new Promise((resolve) => {
		execFile(
			"git",
			["--no-optional-locks", "status", "--porcelain"],
			{ cwd, encoding: "utf8", maxBuffer: 10 * 1024 * 1024 },
			(error: ExecFileException | null, stdout: string) => {
				if (error) {
					resolve(null);
					return;
				}
				try {
					resolve(parseStatusPorcelain(stdout));
				} catch {
					resolve(null);
				}
			},
		);
	});
}
