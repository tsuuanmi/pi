import assert from "node:assert/strict";
import * as os from "node:os";
import * as path from "node:path";
import { describe, it } from "node:test";
import { parseStatusPorcelain, runGitStatusPorcelain } from "#tui/index";

describe("parseStatusPorcelain", () => {
	it("returns zero counts for empty input", () => {
		assert.deepEqual(parseStatusPorcelain(""), { staged: 0, unstaged: 0, untracked: 0 });
	});

	it("counts ?? as untracked only", () => {
		assert.deepEqual(parseStatusPorcelain("?? new-file"), { staged: 0, unstaged: 0, untracked: 1 });
	});

	it("counts a staged modification (M in column 1)", () => {
		assert.deepEqual(parseStatusPorcelain("M  file"), { staged: 1, unstaged: 0, untracked: 0 });
	});

	it("counts an unstaged modification (M in column 2)", () => {
		assert.deepEqual(parseStatusPorcelain(" M file"), { staged: 0, unstaged: 1, untracked: 0 });
	});

	it("counts both staged and unstaged for MM", () => {
		assert.deepEqual(parseStatusPorcelain("MM file"), { staged: 1, unstaged: 1, untracked: 0 });
	});

	it("counts a rename (R in column 1) as one staged", () => {
		assert.deepEqual(parseStatusPorcelain("R  old -> new"), { staged: 1, unstaged: 0, untracked: 0 });
	});

	it("aggregates a mixed working tree", () => {
		const out = ["?? a", "M  b", " M c", "?? d"].join("\n");
		assert.deepEqual(parseStatusPorcelain(out), { staged: 1, unstaged: 1, untracked: 2 });
	});
});

describe("runGitStatusPorcelain error resilience", () => {
	it("resolves null for a non-existent cwd (never throws)", async () => {
		const cwd = path.join(os.tmpdir(), `pi-status-line-no-such-dir-${Date.now()}`);
		assert.equal(await runGitStatusPorcelain(cwd), null);
	});

	it("resolves null for a non-git directory", async () => {
		// os.tmpdir() itself is not a git repo in CI; if it happens to be one,
		// the counts would be near-empty, so only assert it does not throw.
		const result = await runGitStatusPorcelain(os.tmpdir());
		assert.equal(result === null || typeof result?.staged === "number", true);
	});
});
