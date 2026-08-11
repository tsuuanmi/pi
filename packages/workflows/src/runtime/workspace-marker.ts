import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import type { GitDelta } from "#workflows/runtime/types";

export type WorkspaceMarkerStatus = "available" | "not-git" | "git-unavailable" | "unknown" | "deleted";
export type WorkspaceRisk = "normal" | "dirty" | "deleted" | "unknown" | "not-git";

export interface WorkspaceMarker {
	workspace: string;
	status: WorkspaceMarkerStatus;
	head: string | null;
	gitDelta: GitDelta;
	risk: WorkspaceRisk;
}

function gitOutput(workspace: string, args: string[]): string | null {
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

export function buildWorkspaceMarker(workspace: string, base?: string | null): WorkspaceMarker {
	if (!existsSync(workspace)) {
		return { workspace, status: "deleted", head: null, gitDelta: "unknown", risk: "deleted" };
	}
	const inside = gitOutput(workspace, ["rev-parse", "--is-inside-work-tree"]);
	if (inside !== "true") {
		return { workspace, status: "not-git", head: null, gitDelta: "unknown", risk: "not-git" };
	}
	const head = gitOutput(workspace, ["rev-parse", "HEAD"]);
	const porcelain = gitOutput(workspace, ["status", "--porcelain", "--", ".", ":!.pi"]);
	if (porcelain === null) {
		return { workspace, status: "git-unavailable", head, gitDelta: "unknown", risk: "unknown" };
	}
	let gitDelta: GitDelta;
	if (porcelain.length > 0) {
		gitDelta = "dirty";
	} else if (base !== null && base !== undefined && head !== null && head !== base) {
		// porcelain-clean but HEAD advanced past the recorded base: a commit landed with no working-tree change.
		gitDelta = "zero-delta";
	} else {
		gitDelta = "clean";
	}
	return { workspace, status: "available", head, gitDelta, risk: gitDelta === "dirty" ? "dirty" : "normal" };
}
