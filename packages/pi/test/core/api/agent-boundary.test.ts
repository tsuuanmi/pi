import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = join(import.meta.dirname, "../../../../../");

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

	it("keeps only the pi-owned subagent runtime implementation on the pi root", async () => {
		const source = await readRepoFile("packages/pi/src/index.ts");

		expect(source).toContain('export { SubagentManager } from "#pi/subagents/subagents"');
		expect(source).not.toContain("type SubagentRunRequest");
		expect(source).not.toContain("type SubagentRunResult");
		expect(source).not.toContain("type SubagentRecord");
		expect(source).not.toContain("type SubagentAwaitOptions");
	});

	it("does not expose sdk/messages as a compatibility subpath", async () => {
		const packageJson = JSON.parse(await readRepoFile("packages/pi/package.json")) as {
			exports?: Record<string, unknown>;
		};
		const sdkMessages = await readRepoFile("packages/pi/src/sdk/messages.ts");

		expect(packageJson.exports).not.toHaveProperty("./sdk/messages");
		expect(sdkMessages).not.toContain('from "@tsuuanmi/pi-agent"');
	});
});
