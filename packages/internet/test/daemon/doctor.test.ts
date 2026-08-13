import type { ChildProcess, ExecFileException, ExecFileOptionsWithStringEncoding } from "node:child_process";
import { InternetError } from "#internet/core/errors";
import type { InternetAccount } from "#internet/core/types";
import { runDaemonDoctor } from "#internet/daemon/doctor";
import type { DaemonRuntime } from "#internet/daemon/runtime";

const account: InternetAccount = {
	id: "default",
	backend: "openai",
	displayName: "ChatGPT Web",
	configDir: "/tmp/internet/default",
	host: "127.0.0.1",
	port: 17841,
	enabled: true,
	conversationMode: "temporary",
};

const runtime: DaemonRuntime = {
	root: "/runtime",
	launcher: "/runtime/bin/codex-chatgpt-web",
	manifest: {
		schemaVersion: 1,
		appVersion: "2.1.8",
		platform: "linux",
		arch: "x64",
		launcher: "bin/codex-chatgpt-web",
	},
};

const readyReport = JSON.stringify({
	ok: true,
	mode: "browser-only",
	checks: [{ id: "config", status: "ok", message: "Configuration is valid" }],
});

function execResult(
	error: ExecFileException | null,
	stdout = "",
	stderr = "",
	inspect?: (file: string, args: readonly string[], options: Record<string, unknown>) => void,
) {
	return (
		file: string,
		args: readonly string[],
		options: ExecFileOptionsWithStringEncoding,
		callback: (error: ExecFileException | null, stdout: string, stderr: string) => void,
	): ChildProcess => {
		inspect?.(file, args, options as Record<string, unknown>);
		queueMicrotask(() => callback(error, stdout, stderr));
		return {} as ChildProcess;
	};
}

function commandError(code: number, message: string): ExecFileException {
	return Object.assign(new Error(message), { code }) as ExecFileException;
}

describe("runDaemonDoctor", () => {
	it("runs the account-scoped bundled doctor and parses its report", async () => {
		const inspect = vi.fn();
		const report = await runDaemonDoctor(account, {
			execFile: execResult(null, readyReport, "", inspect),
			resolveRuntime: async () => runtime,
		});
		expect(report).toMatchObject({
			ok: true,
			upstreamOk: true,
			mode: "browser-only",
			checks: [{ id: "config", scope: "pi" }],
		});
		expect(inspect).toHaveBeenCalledWith(
			runtime.launcher,
			["--home", account.configDir, "doctor", "--json"],
			expect.objectContaining({
				encoding: "utf8",
				killSignal: "SIGKILL",
				maxBuffer: 1024 * 1024,
				timeout: 45_000,
				env: expect.objectContaining({ CODEX_CHATGPT_WEB_HOME: account.configDir }),
			}),
		);
	});

	it("returns a valid failing report from the doctor's documented exit status", async () => {
		const report = await runDaemonDoctor(account, {
			execFile: execResult(
				commandError(1, "doctor reported failures"),
				JSON.stringify({
					ok: false,
					checks: [
						{ id: "config", status: "ok", message: "Configuration is valid" },
						{ id: "codex", status: "error", message: "Codex route is missing" },
						{ id: "service", status: "warning", message: "Managed service is unavailable" },
					],
				}),
			),
			resolveRuntime: async () => runtime,
		});
		expect(report).toMatchObject({
			ok: true,
			upstreamOk: false,
			checks: [
				{ id: "config", scope: "pi" },
				{ id: "codex", scope: "upstream" },
				{ id: "service", scope: "upstream" },
			],
		});
	});

	it("scopes every vendored check and fails readiness for Pi errors", async () => {
		const checks = [
			["config", "pi"],
			["browser-host", "pi"],
			["chrome", "pi"],
			["login", "pi"],
			["proxy", "pi"],
			["codex", "upstream"],
			["service", "upstream"],
			["tools", "upstream"],
			["tunnel-binary", "upstream"],
			["tunnel-key", "upstream"],
			["tunnel-service", "upstream"],
			["tunnel-runtime", "upstream"],
			["connector", "upstream"],
		] as const;
		const report = await runDaemonDoctor(account, {
			execFile: execResult(
				commandError(1, "doctor reported failures"),
				JSON.stringify({
					ok: false,
					checks: checks.map(([id]) => ({
						id,
						status: id === "proxy" ? "error" : "warning",
						message: id,
					})),
				}),
			),
			resolveRuntime: async () => runtime,
		});
		expect(report.ok).toBe(false);
		expect(report.checks.map(({ id, scope }) => [id, scope])).toEqual(checks);
	});

	it.each([
		[
			"an aggregate that contradicts its checks",
			null,
			JSON.stringify({ ok: true, checks: [{ id: "config", status: "error", message: "Invalid" }] }),
		],
		[
			"exit zero with a failing aggregate",
			null,
			JSON.stringify({ ok: false, checks: [{ id: "config", status: "error", message: "Invalid" }] }),
		],
		["exit one with a healthy aggregate", commandError(1, "unexpected"), readyReport],
	])("rejects %s", async (_case, error, stdout) => {
		await expect(
			runDaemonDoctor(account, {
				execFile: execResult(error, stdout),
				resolveRuntime: async () => runtime,
			}),
		).rejects.toMatchObject({ code: "daemon_doctor_failed", retryable: false });
	});

	it.each([
		["invalid JSON", "not-json"],
		["an invalid shape", JSON.stringify({ ok: true })],
		[
			"an unknown check",
			JSON.stringify({
				ok: true,
				checks: [{ id: "future-check", status: "ok", message: "Unknown semantics" }],
			}),
		],
	])("rejects %s", async (_case, stdout) => {
		await expect(
			runDaemonDoctor(account, {
				execFile: execResult(null, stdout),
				resolveRuntime: async () => runtime,
			}),
		).rejects.toMatchObject({ code: "daemon_doctor_failed", retryable: false });
	});

	it("wraps command failures with typed diagnostics", async () => {
		await expect(
			runDaemonDoctor(account, {
				execFile: execResult(commandError(2, "spawn failed"), "", "launcher failed"),
				resolveRuntime: async () => runtime,
			}),
		).rejects.toMatchObject({
			code: "daemon_doctor_failed",
			retryable: false,
			message: "ChatGPT Web doctor failed for account default: launcher failed",
		});
	});

	it("reports timeouts and cancellation clearly", async () => {
		const timeout = Object.assign(new Error("timed out"), { code: null, killed: true }) as ExecFileException;
		await expect(
			runDaemonDoctor(account, {
				execFile: execResult(timeout),
				resolveRuntime: async () => runtime,
				timeoutMs: 25,
			}),
		).rejects.toMatchObject({ message: "ChatGPT Web doctor timed out for account default after 25ms." });

		const controller = new AbortController();
		controller.abort();
		await expect(
			runDaemonDoctor(account, {
				execFile: execResult(commandError("ABORT_ERR" as never, "aborted")),
				resolveRuntime: async () => runtime,
				signal: controller.signal,
			}),
		).rejects.toMatchObject({ message: "ChatGPT Web doctor was cancelled for account default." });
	});

	it("wraps runtime resolution failures", async () => {
		await expect(
			runDaemonDoctor(account, {
				execFile: execResult(null, readyReport),
				resolveRuntime: async () => {
					throw new Error("runtime missing");
				},
			}),
		).rejects.toBeInstanceOf(InternetError);
	});
});
