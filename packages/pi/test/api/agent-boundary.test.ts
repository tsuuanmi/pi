import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = join(import.meta.dirname, "../../../../");

async function readRepoFile(path: string): Promise<string> {
	return readFile(join(repoRoot, path), "utf8");
}

describe("pi public agent boundary", () => {
	it("does not re-export shared agent primitives from the pi root", async () => {
		const source = await readRepoFile("packages/pi/src/index.ts");

		expect(source).not.toContain('from "@tsuuanmi/pi-agent"');
		expect(source).not.toContain('from "@tsuuanmi/pi-agent/node"');
		expect(source).not.toContain("convertToLlm");
		expect(source).not.toContain("extractYieldFromMessages");
		expect(source).not.toContain("renderSubagentProgress");
		expect(source).not.toContain("serializeConversation");
		expect(source).not.toContain("withFileMutationQueue");
		expect(source).not.toContain("resolvePath");
	});

	it("exports the complete pi-owned subagent API", async () => {
		const source = await readRepoFile("packages/pi/src/index.ts");

		expect(source).toContain('export { SubagentManager } from "#pi/subagents/manager"');
		expect(source).toContain('export type { SubagentManagerApi } from "#pi/subagents/manager-api"');
		expect(source).toContain('export { registerSubagentTools, SUBAGENT_SPECS } from "#pi/subagents/lifecycle-tools"');
		expect(source).toContain('export { registerSubagentControls } from "#pi/subagents/tools"');
		expect(source).toContain('export * from "#pi/subagents/context"');
		expect(source).toContain('export * from "#pi/subagents/progress"');
		expect(source).toContain('export * from "#pi/subagents/receipts"');
		expect(source).toContain('export * from "#pi/subagents/spec"');
		expect(source).toContain('export * from "#pi/subagents/thinking-level"');
		expect(source).toContain('export * from "#pi/subagents/types"');
		expect(source).toContain('export * from "#pi/subagents/yield-result"');
	});

	it("does not retain subagent ownership in Agent", async () => {
		const source = await readRepoFile("packages/agent/src/index.ts");

		expect(source).not.toContain("#agent/subagents");
		expect(source).not.toContain("SubagentManager");
		expect(source).not.toContain("SUBAGENT_");
	});

	it("does not expose sdk/messages as a compatibility subpath", async () => {
		const packageJson = JSON.parse(await readRepoFile("packages/pi/package.json")) as {
			exports?: Record<string, unknown>;
		};

		expect(packageJson.exports).not.toHaveProperty("./sdk/messages");
	});
});
