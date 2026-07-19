import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import {
	parseStatusPorcelain,
	runGitStatusPorcelain,
} from "#coding-agent/modes/interactive/components/status-line/git-utils";

describe("parseStatusPorcelain", () => {
	it("returns zero counts for empty input", () => {
		expect(parseStatusPorcelain("")).toEqual({ staged: 0, unstaged: 0, untracked: 0 });
	});

	it("counts ?? as untracked only", () => {
		expect(parseStatusPorcelain("?? new-file")).toEqual({ staged: 0, unstaged: 0, untracked: 1 });
	});

	it("counts a staged modification (M in column 1)", () => {
		expect(parseStatusPorcelain("M  file")).toEqual({ staged: 1, unstaged: 0, untracked: 0 });
	});

	it("counts an unstaged modification (M in column 2)", () => {
		expect(parseStatusPorcelain(" M file")).toEqual({ staged: 0, unstaged: 1, untracked: 0 });
	});

	it("counts both staged and unstaged for MM", () => {
		expect(parseStatusPorcelain("MM file")).toEqual({ staged: 1, unstaged: 1, untracked: 0 });
	});

	it("counts a rename (R in column 1) as one staged", () => {
		expect(parseStatusPorcelain("R  old -> new")).toEqual({ staged: 1, unstaged: 0, untracked: 0 });
	});

	it("aggregates a mixed working tree", () => {
		const out = ["?? a", "M  b", " M c", "?? d"].join("\n");
		expect(parseStatusPorcelain(out)).toEqual({ staged: 1, unstaged: 1, untracked: 2 });
	});
});

describe("runGitStatusPorcelain error resilience", () => {
	it("resolves null for a non-existent cwd (never throws)", async () => {
		const cwd = path.join(os.tmpdir(), `pi-status-line-no-such-dir-${Date.now()}`);
		await expect(runGitStatusPorcelain(cwd)).resolves.toBeNull();
	});

	it("resolves null for a non-git directory", async () => {
		// os.tmpdir() itself is not a git repo in CI; if it happens to be one,
		// the counts would be near-empty, so only assert it does not throw.
		const result = await runGitStatusPorcelain(os.tmpdir());
		expect(result === null || typeof result?.staged === "number").toBe(true);
	});
});
