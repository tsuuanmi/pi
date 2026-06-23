import { describe, expect, it } from "vitest";
import { createGithubToolDefinition } from "../../src/workflows/harness-tools/github.ts";

describe("github tool", () => {
	it("registers the expected tool metadata", () => {
		const tool = createGithubToolDefinition();
		expect(tool.name).toBe("github");
		expect(tool.label).toContain("GitHub");
		expect(tool.description).toContain("gh");
		expect(tool.promptSnippet).toContain("gh CLI");
	});

	it("rejects an empty command", async () => {
		const tool = createGithubToolDefinition();
		await expect(
			tool.execute("tc-1", { command: "", args: [] }, undefined, undefined, undefined as never),
		).rejects.toThrow(/command is required/);
	});
});
