import { describe, expect, test } from "vitest";
import type { BashOperations } from "#pi/execution/backend";
import { runBash } from "#pi/execution/bash";

function backend(run: BashOperations["exec"]): BashOperations {
	return { exec: run };
}

describe("runBash", () => {
	test("preserves UTF-8 split across output chunks", async () => {
		const chunks: string[] = [];
		const value = Buffer.from("hé");
		const result = await runBash(
			"ignored",
			process.cwd(),
			backend(async (_command, _cwd, options) => {
				options.onData(value.subarray(0, 2));
				options.onData(value.subarray(2));
				return { exitCode: 0 };
			}),
			{ onChunk: (chunk) => chunks.push(chunk) },
		);

		expect(result).toMatchObject({ output: "hé", exitCode: 0, cancelled: false, truncated: false });
		expect(chunks.join("")).toBe("hé");
	});

	test("returns buffered output when cancellation interrupts the backend", async () => {
		const controller = new AbortController();
		const result = await runBash(
			"ignored",
			process.cwd(),
			backend(async (_command, _cwd, options) => {
				options.onData(Buffer.from("partial"));
				controller.abort();
				throw new Error("cancelled");
			}),
			{ signal: controller.signal },
		);

		expect(result).toMatchObject({ output: "partial", exitCode: undefined, cancelled: true, truncated: false });
	});
});
