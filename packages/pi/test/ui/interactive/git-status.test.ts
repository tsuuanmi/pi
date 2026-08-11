import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { parseGitStatus, readGitStatus } from "#pi/ui/interactive/git-status";

describe("parseGitStatus", () => {
	it("returns zero counts for empty input", () => {
		expect(parseGitStatus("")).toEqual({ staged: 0, unstaged: 0, untracked: 0 });
	});

	it("counts untracked files separately", () => {
		expect(parseGitStatus("?? new-file")).toEqual({ staged: 0, unstaged: 0, untracked: 1 });
	});

	it("counts index and working-tree changes", () => {
		const status = ["M  staged", " M unstaged", "MM both", "R  old -> new", "?? new"].join("\n");
		expect(parseGitStatus(status)).toEqual({ staged: 3, unstaged: 2, untracked: 1 });
	});
});

describe("readGitStatus", () => {
	it("returns null for a missing directory", async () => {
		const cwd = path.join(os.tmpdir(), `pi-status-no-such-dir-${Date.now()}`);
		expect(await readGitStatus(cwd)).toBeNull();
	});

	it("does not throw outside a repository", async () => {
		const result = await readGitStatus(os.tmpdir());
		expect(result === null || typeof result.staged === "number").toBe(true);
	});
});
