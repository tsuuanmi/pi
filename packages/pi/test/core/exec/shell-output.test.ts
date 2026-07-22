import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getOrThrow, NodeExecutionEnv } from "@tsuuanmi/pi-agent/node";
import { afterEach, describe, expect, it } from "vitest";
import { executeShellWithCapture } from "#pi/exec/shell-output";

const tempDirs: string[] = [];

afterEach(async () => {
	await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("shell output capture", () => {
	it("captures large shell output to a full output file through the execution env", async () => {
		const root = await mkdtemp(join(tmpdir(), "pi-shell-output-"));
		tempDirs.push(root);
		const env = new NodeExecutionEnv({ cwd: root });
		const result = getOrThrow(await executeShellWithCapture(env, "yes line | head -n 15000"));
		expect(result.truncated).toBe(true);
		expect(result.fullOutputPath).toBeDefined();
		const fullOutput = getOrThrow(await env.readTextFile(result.fullOutputPath!));
		expect(fullOutput.split("\n").length).toBeGreaterThan(10000);
		expect(result.output.length).toBeLessThan(fullOutput.length);
	});
});
