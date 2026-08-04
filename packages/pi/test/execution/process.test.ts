import { describe, expect, test } from "vitest";
import { createLocalBash } from "#pi/execution/local";
import { runProgram } from "#pi/execution/program";

const node = process.execPath;

describe("runProgram", () => {
	test("returns decoded output and process metadata", async () => {
		const result = await runProgram(node, ["-e", 'process.stdout.write("out"); process.stderr.write("err")']);

		expect(result).toEqual({
			stdout: "out",
			stderr: "err",
			exitCode: 0,
			signal: null,
			reason: "completed",
		});
	});
});

describe("createLocalBash", () => {
	test("streams local Bash output", async () => {
		const chunks: Buffer[] = [];
		const result = await createLocalBash().exec("printf 'hello'", process.cwd(), {
			onData: (chunk) => chunks.push(chunk),
		});

		expect(Buffer.concat(chunks).toString()).toBe("hello");
		expect(result).toEqual({ exitCode: 0 });
	});

	test("reports a timeout as a typed execution error", async () => {
		await expect(
			createLocalBash().exec("sleep 5", process.cwd(), {
				onData: () => undefined,
				timeoutSeconds: 0.025,
			}),
		).rejects.toMatchObject({ code: "timeout" });
	});
});
