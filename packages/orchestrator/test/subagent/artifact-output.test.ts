import { createHash } from "node:crypto";
import { mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readTaskPrompt, writeOutputArtifact } from "#orchestrator/subagent/artifact-output";

function sha256(value: string): string {
	return createHash("sha256").update(value).digest("hex");
}

describe("subagent artifact output", () => {
	let cwd: string;

	beforeEach(async () => {
		cwd = join(tmpdir(), `pi-agent-artifact-${Date.now()}-${Math.random().toString(36).slice(2)}`);
		await mkdir(cwd, { recursive: true });
	});

	afterEach(async () => {
		await rm(cwd, { recursive: true, force: true });
	});

	it("reads a non-empty workspace task prompt", async () => {
		await writeFile(join(cwd, "task.md"), "Review the plan", "utf8");
		await expect(readTaskPrompt(cwd, "task.md")).resolves.toBe("Review the plan");
		await expect(readTaskPrompt(cwd, "../outside.md")).rejects.toThrow(/within the workspace/);
	});

	it("creates output without replacing an existing artifact", async () => {
		const artifact = await writeOutputArtifact(
			cwd,
			{ path: ".pi/output/plan.md", mode: "create", mediaType: "text/markdown" },
			"# Plan\n",
		);
		expect(await readFile(artifact.path, "utf8")).toBe("# Plan\n");
		expect(artifact).toMatchObject({ sha256: sha256("# Plan\n"), media_type: "text/markdown", mode: "create" });
		await expect(
			writeOutputArtifact(cwd, { path: ".pi/output/plan.md", mode: "create" }, "replacement"),
		).rejects.toThrow(/already exists/);
	});

	it("requires optimistic concurrency for replacement", async () => {
		const path = join(cwd, "plan.md");
		await writeFile(path, "old", "utf8");
		await expect(writeOutputArtifact(cwd, { path: "plan.md", mode: "replace" }, "new")).rejects.toThrow(
			/expectedSha256/,
		);
		await expect(
			writeOutputArtifact(cwd, { path: "plan.md", mode: "replace", expectedSha256: sha256("other") }, "new"),
		).rejects.toThrow(/changed before replacement/);
		await writeOutputArtifact(cwd, { path: "plan.md", mode: "replace", expectedSha256: sha256("old") }, "new");
		expect(await readFile(path, "utf8")).toBe("new");
	});

	it("rejects symbolic-link path traversal", async () => {
		const outside = join(tmpdir(), `pi-agent-artifact-outside-${Date.now()}`);
		await mkdir(outside, { recursive: true });
		await symlink(outside, join(cwd, "linked"));
		await expect(writeOutputArtifact(cwd, { path: "linked/output.md", mode: "create" }, "unsafe")).rejects.toThrow(
			/symbolic links/,
		);
		await rm(outside, { recursive: true, force: true });
	});
});
