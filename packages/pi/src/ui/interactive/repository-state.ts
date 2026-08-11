import { type ExecFileException, execFile, spawnSync } from "node:child_process";
import {
	existsSync,
	type FSWatcher,
	readFileSync,
	statSync,
	unwatchFile,
	type WatchListener,
	watch,
	watchFile,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import type { GitStatusSummary } from "@tsuuanmi/pi-tui";
import { readGitStatus } from "#pi/ui/interactive/git-status";

const STATUS_REFRESH_MS = 10_000;
const WATCH_DEBOUNCE_MS = 500;
const WATCH_RETRY_DELAY_MS = 5000;

type GitPaths = {
	repoDir: string;
	commonGitDir: string;
	headPath: string;
};

function closeWatcher(watcher: FSWatcher | null): void {
	try {
		watcher?.close();
	} catch {
		// Watcher cleanup is best-effort.
	}
}

function watchWithError(path: string, listener: WatchListener<string>, onError: () => void): FSWatcher | null {
	try {
		const watcher = watch(path, listener);
		watcher.on("error", onError);
		return watcher;
	} catch {
		onError();
		return null;
	}
}

function findGitPaths(cwd: string): GitPaths | null {
	let dir = cwd;
	while (true) {
		const gitPath = join(dir, ".git");
		if (existsSync(gitPath)) {
			try {
				const stat = statSync(gitPath);
				if (stat.isFile()) {
					const content = readFileSync(gitPath, "utf8").trim();
					if (content.startsWith("gitdir: ")) {
						const gitDir = resolve(dir, content.slice(8).trim());
						const headPath = join(gitDir, "HEAD");
						if (!existsSync(headPath)) return null;
						const commonDirPath = join(gitDir, "commondir");
						const commonGitDir = existsSync(commonDirPath)
							? resolve(gitDir, readFileSync(commonDirPath, "utf8").trim())
							: gitDir;
						return { repoDir: dir, commonGitDir, headPath };
					}
				} else if (stat.isDirectory()) {
					const headPath = join(gitPath, "HEAD");
					if (!existsSync(headPath)) return null;
					return { repoDir: dir, commonGitDir: gitPath, headPath };
				}
			} catch {
				return null;
			}
		}
		const parent = dirname(dir);
		if (parent === dir) return null;
		dir = parent;
	}
}

function resolveBranchWithGitSync(repoDir: string): string | null {
	const result = spawnSync("git", ["--no-optional-locks", "symbolic-ref", "--quiet", "--short", "HEAD"], {
		cwd: repoDir,
		encoding: "utf8",
		stdio: ["ignore", "pipe", "ignore"],
	});
	const branch = result.status === 0 ? result.stdout.trim() : "";
	return branch || null;
}

function resolveBranchWithGit(repoDir: string): Promise<string | null> {
	return new Promise((resolvePromise) => {
		execFile(
			"git",
			["--no-optional-locks", "symbolic-ref", "--quiet", "--short", "HEAD"],
			{ cwd: repoDir, encoding: "utf8" },
			(error: ExecFileException | null, stdout: string) => {
				resolvePromise(error ? null : stdout.trim() || null);
			},
		);
	});
}

function statusEquals(a: GitStatusSummary | null | undefined, b: GitStatusSummary | null): boolean {
	return (
		a === b || Boolean(a && b && a.staged === b.staged && a.unstaged === b.unstaged && a.untracked === b.untracked)
	);
}

/** Owns repository discovery, branch watching, status polling, and cached snapshots for one UI host. */
export class RepositoryState {
	private cwd: string;
	private gitPaths: GitPaths | null;
	private branch: string | null | undefined;
	private status: GitStatusSummary | null | undefined;
	private headWatcher: FSWatcher | null = null;
	private reftableWatcher: FSWatcher | null = null;
	private reftableTablesListWatcher: FSWatcher | null = null;
	private reftableTablesListPath: string | null = null;
	private branchRefreshTimer: ReturnType<typeof setTimeout> | null = null;
	private watcherRetryTimer: ReturnType<typeof setTimeout> | null = null;
	private statusRefreshTimer: ReturnType<typeof setInterval> | null = null;
	private branchRefreshInFlight = false;
	private branchRefreshPending = false;
	private statusRefreshInFlight = false;
	private listeners = new Set<() => void>();
	private generation = 0;
	private disposed = false;

	constructor(cwd: string) {
		this.cwd = cwd;
		this.gitPaths = findGitPaths(cwd);
		this.setupWatchers();
	}

	getBranch(): string | null {
		if (this.branch === undefined) this.branch = this.resolveBranchSync();
		return this.branch;
	}

	getStatus(): GitStatusSummary | null {
		if (!this.statusRefreshTimer && !this.disposed) {
			void this.refreshStatus();
			this.statusRefreshTimer = setInterval(() => void this.refreshStatus(), STATUS_REFRESH_MS);
			this.statusRefreshTimer.unref?.();
		}
		return this.status ?? null;
	}

	onChange(listener: () => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	setCwd(cwd: string): void {
		if (this.cwd === cwd) return;
		this.generation += 1;
		this.cwd = cwd;
		this.branch = undefined;
		this.status = undefined;
		this.gitPaths = findGitPaths(cwd);
		this.branchRefreshInFlight = false;
		this.branchRefreshPending = false;
		this.statusRefreshInFlight = false;
		this.clearWatchers();
		this.setupWatchers();
		if (this.statusRefreshTimer) void this.refreshStatus();
		this.notifyChange();
	}

	dispose(): void {
		if (this.disposed) return;
		this.disposed = true;
		this.generation += 1;
		if (this.branchRefreshTimer) clearTimeout(this.branchRefreshTimer);
		if (this.statusRefreshTimer) clearInterval(this.statusRefreshTimer);
		this.branchRefreshTimer = null;
		this.statusRefreshTimer = null;
		this.clearWatchers();
		this.listeners.clear();
	}

	private notifyChange(): void {
		for (const listener of this.listeners) listener();
	}

	private scheduleBranchRefresh(): void {
		if (this.disposed || this.branchRefreshTimer) return;
		if (this.branchRefreshInFlight) {
			this.branchRefreshPending = true;
			return;
		}
		this.branchRefreshTimer = setTimeout(() => {
			this.branchRefreshTimer = null;
			void this.refreshBranch();
		}, WATCH_DEBOUNCE_MS);
	}

	private async refreshBranch(): Promise<void> {
		if (this.disposed) return;
		if (this.branchRefreshInFlight) {
			this.branchRefreshPending = true;
			return;
		}
		this.branchRefreshInFlight = true;
		const generation = this.generation;
		try {
			const nextBranch = await this.resolveBranch();
			if (this.disposed || generation !== this.generation) return;
			const changed = this.branch !== undefined && this.branch !== nextBranch;
			this.branch = nextBranch;
			if (changed) this.notifyChange();
		} finally {
			if (generation === this.generation) {
				this.branchRefreshInFlight = false;
				if (this.branchRefreshPending && !this.disposed) {
					this.branchRefreshPending = false;
					this.scheduleBranchRefresh();
				}
			}
		}
	}

	private async refreshStatus(): Promise<void> {
		if (this.disposed || this.statusRefreshInFlight) return;
		this.statusRefreshInFlight = true;
		const generation = this.generation;
		const cwd = this.cwd;
		try {
			const nextStatus = await readGitStatus(cwd);
			if (this.disposed || generation !== this.generation) return;
			const changed = !statusEquals(this.status, nextStatus);
			this.status = nextStatus;
			if (changed) this.notifyChange();
		} finally {
			if (generation === this.generation) this.statusRefreshInFlight = false;
		}
	}

	private resolveBranchSync(): string | null {
		try {
			if (!this.gitPaths) return null;
			const content = readFileSync(this.gitPaths.headPath, "utf8").trim();
			if (!content.startsWith("ref: refs/heads/")) return "detached";
			const branch = content.slice(16);
			return branch === ".invalid" ? (resolveBranchWithGitSync(this.gitPaths.repoDir) ?? "detached") : branch;
		} catch {
			return null;
		}
	}

	private async resolveBranch(): Promise<string | null> {
		try {
			if (!this.gitPaths) return null;
			const content = readFileSync(this.gitPaths.headPath, "utf8").trim();
			if (!content.startsWith("ref: refs/heads/")) return "detached";
			const branch = content.slice(16);
			return branch === ".invalid" ? ((await resolveBranchWithGit(this.gitPaths.repoDir)) ?? "detached") : branch;
		} catch {
			return null;
		}
	}

	private clearWatchers(): void {
		closeWatcher(this.headWatcher);
		closeWatcher(this.reftableWatcher);
		closeWatcher(this.reftableTablesListWatcher);
		this.headWatcher = null;
		this.reftableWatcher = null;
		this.reftableTablesListWatcher = null;
		if (this.reftableTablesListPath) {
			unwatchFile(this.reftableTablesListPath);
			this.reftableTablesListPath = null;
		}
		if (this.watcherRetryTimer) {
			clearTimeout(this.watcherRetryTimer);
			this.watcherRetryTimer = null;
		}
	}

	private handleWatcherError(): void {
		this.clearWatchers();
		if (this.disposed || this.watcherRetryTimer) return;
		this.watcherRetryTimer = setTimeout(() => {
			this.watcherRetryTimer = null;
			this.setupWatchers();
		}, WATCH_RETRY_DELAY_MS);
	}

	private setupWatchers(): void {
		this.clearWatchers();
		if (!this.gitPaths) return;
		this.headWatcher = watchWithError(
			dirname(this.gitPaths.headPath),
			(_eventType, filename) => {
				if (!filename || filename === "HEAD") this.scheduleBranchRefresh();
			},
			() => this.handleWatcherError(),
		);
		if (!this.headWatcher) return;

		const reftableDir = join(this.gitPaths.commonGitDir, "reftable");
		if (!existsSync(reftableDir)) return;
		this.reftableWatcher = watchWithError(
			reftableDir,
			() => this.scheduleBranchRefresh(),
			() => this.handleWatcherError(),
		);
		if (!this.reftableWatcher) return;

		const tablesListPath = join(reftableDir, "tables.list");
		if (!existsSync(tablesListPath)) return;
		this.reftableTablesListPath = tablesListPath;
		this.reftableTablesListWatcher = watchWithError(
			tablesListPath,
			() => this.scheduleBranchRefresh(),
			() => this.handleWatcherError(),
		);
		if (!this.reftableTablesListWatcher) return;
		watchFile(tablesListPath, { interval: 250 }, (current, previous) => {
			if (
				current.mtimeMs !== previous.mtimeMs ||
				current.ctimeMs !== previous.ctimeMs ||
				current.size !== previous.size
			) {
				this.scheduleBranchRefresh();
			}
		});
	}
}
