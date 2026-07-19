/**
 * Non-mutating dirty-worktree preservation (Phase 2 data-loss gate evidence source).
 *
 * Before any destructive recovery, capture REAL evidence and a recoverable snapshot WITHOUT
 * mutating the working tree:
 *   - the tracked diff (`git diff HEAD -- . :!.pi`) + its sha256,
 *   - an untracked-file manifest (path/size/sha256), excluding `.pi` harness state,
 *   - a `git stash create` commit object stored via `git stash store`, which snapshots
 *     tracked+staged changes without touching the worktree.
 *
 * Never deletes, resets, checks out, or cleans. `snapshotComplete` is fail-closed: every dirty
 * component must be captured, else the vanish receipt built from it is invalid and recovery
 * blocks.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { GitDelta } from "#workflows/runtime/types";

export interface UntrackedEntry {
	path: string;
	size: number;
	sha256: string;
}

export interface PreserveResult {
	gitDelta: GitDelta;
	trackedDiff: string;
	trackedDiffSha256: string;
	untrackedManifest: UntrackedEntry[];
	stashRef: string | null;
	snapshotComplete: boolean;
}

function git(workspace: string, args: string[]): string | null {
	try {
		return execFileSync("git", args, {
			cwd: workspace,
			encoding: "utf8",
			stdio: ["ignore", "pipe", "ignore"],
		}).trim();
	} catch {
		return null;
	}
}

function sha256(input: string | Buffer): string {
	return createHash("sha256").update(input).digest("hex");
}

/**
 * Capture + snapshot a (possibly dirty) worktree without mutating it. Safe to call on a clean
 * tree (returns empty evidence). Never deletes, resets, or cleans. Excludes `.pi` harness
 * state from both the tracked diff and the untracked manifest.
 */
export function preserveDirtyWorktree(workspace: string): PreserveResult {
	const trackedDiff = git(workspace, ["diff", "HEAD", "--", ".", ":!.pi"]) ?? "";

	let untracked: string[] = [];
	const untrackedRaw = git(workspace, ["ls-files", "--others", "--exclude-standard", "--", ".", ":!.pi"]);
	if (untrackedRaw !== null) {
		untracked = untrackedRaw
			.split("\n")
			.map((s) => s.trim())
			.filter(Boolean);
	}

	const untrackedManifest: UntrackedEntry[] = [];
	for (const rel of untracked) {
		try {
			const buf = readFileSync(join(workspace, rel));
			untrackedManifest.push({ path: rel, size: buf.length, sha256: sha256(buf) });
		} catch {
			// unreadable entry — record path with a marker rather than dropping it (fail-closed).
			untrackedManifest.push({ path: rel, size: -1, sha256: "unreadable" });
		}
	}

	// `git stash create` builds a stash commit WITHOUT modifying the working tree; store it so it
	// survives in the stash list as a recoverable ref. Empty on a clean tree; null when it cannot
	// be created (e.g. no commits to stash against).
	let stashRef: string | null = null;
	const oid = git(workspace, ["stash", "create"]);
	if (oid) {
		const stored = git(workspace, ["stash", "store", "-m", "harness-vanish-snapshot", oid]);
		stashRef = stored === null ? null : oid;
	}

	const dirty = trackedDiff.trim().length > 0 || untrackedManifest.length > 0;
	// snapshotComplete iff every dirty component is actually captured: tracked changes need a
	// stash ref (or be empty), untracked entries need readable hashes.
	const trackedCaptured = trackedDiff.trim().length === 0 || stashRef !== null;
	const untrackedCaptured = untrackedManifest.every((entry) => entry.sha256 !== "unreadable");
	return {
		gitDelta: dirty ? "dirty" : "clean",
		trackedDiff,
		trackedDiffSha256: sha256(trackedDiff),
		untrackedManifest,
		stashRef,
		snapshotComplete: trackedCaptured && untrackedCaptured,
	};
}
