import { ExecutionError, resolveShell, runProcess } from "@tsuuanmi/pi-agent/node";
import { describe, expect, test } from "vitest";

const node = process.execPath;

function script(body: string): string[] {
	return ["-e", body];
}

describe("runProcess", () => {
	test("captures stdout and stderr without decoding per chunk", async () => {
		const stdout: Buffer[] = [];
		const stderr: Buffer[] = [];
		const result = await runProcess(node, script('process.stdout.write("out"); process.stderr.write("err")'), {
			onStdout: (chunk) => stdout.push(chunk),
			onStderr: (chunk) => stderr.push(chunk),
		});

		expect(Buffer.concat(stdout).toString()).toBe("out");
		expect(Buffer.concat(stderr).toString()).toBe("err");
		expect(result).toEqual({ exitCode: 0, signal: null, reason: "completed" });
	});

	test("preserves non-zero exit codes", async () => {
		const result = await runProcess(node, script("process.exit(7)"));

		expect(result).toEqual({ exitCode: 7, signal: null, reason: "completed" });
	});

	test("reports aborts", async () => {
		const controller = new AbortController();
		const promise = runProcess(node, script("setTimeout(() => {}, 5000)"), {
			signal: controller.signal,
		});
		setTimeout(() => controller.abort(), 25);

		expect(await promise).toMatchObject({ exitCode: null, reason: "aborted" });
	});

	test("reports timeouts", async () => {
		const result = await runProcess(node, script("setTimeout(() => {}, 5000)"), { timeoutMs: 25 });

		expect(result).toMatchObject({ exitCode: null, reason: "timeout" });
	});

	test("reports spawn failures", async () => {
		await expect(runProcess("pi-command-does-not-exist", [])).rejects.toMatchObject({
			code: "spawn_error",
		});
		await expect(runProcess("pi-command-does-not-exist", [])).rejects.toBeInstanceOf(ExecutionError);
	});
});

describe("resolveShell", () => {
	test("rejects a missing explicit shell", () => {
		expect(() => resolveShell("/pi-shell-does-not-exist")).toThrow("Shell is not executable");
	});
});
