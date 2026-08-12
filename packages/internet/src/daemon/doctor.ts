import {
	type ChildProcess,
	execFile as defaultExecFile,
	type ExecFileException,
	type ExecFileOptionsWithStringEncoding,
} from "node:child_process";
import { InternetError } from "#internet/core/errors";
import type { InternetAccount } from "#internet/core/types";
import type { DaemonRuntime } from "#internet/daemon/runtime";
import { resolveDaemonRuntime } from "#internet/daemon/runtime";

const DOCTOR_TIMEOUT_MS = 45_000;
const DOCTOR_MAX_BUFFER_BYTES = 1024 * 1024;

export type DoctorStatus = "ok" | "warning" | "error";

export interface DoctorCheck {
	id: string;
	status: DoctorStatus;
	message: string;
	detail?: string;
	scope: "pi" | "upstream";
}

export interface DoctorReport {
	ok: boolean;
	upstreamOk: boolean;
	mode?: "browser-only" | "full";
	checks: DoctorCheck[];
}

type DaemonDoctorCheck = Omit<DoctorCheck, "scope">;

type DaemonDoctorReport = Omit<DoctorReport, "upstreamOk" | "checks"> & {
	checks: DaemonDoctorCheck[];
};

type DoctorExecFile = (
	file: string,
	args: readonly string[],
	options: ExecFileOptionsWithStringEncoding,
	callback: (error: ExecFileException | null, stdout: string, stderr: string) => void,
) => ChildProcess;

export interface RunDaemonDoctorOptions {
	execFile?: DoctorExecFile;
	resolveRuntime?: () => Promise<DaemonRuntime>;
	signal?: AbortSignal;
	timeoutMs?: number;
}

interface DoctorCommandResult {
	error: ExecFileException | null;
	stdout: string;
	stderr: string;
}

export async function runDaemonDoctor(
	account: InternetAccount,
	options: RunDaemonDoctorOptions = {},
): Promise<DoctorReport> {
	let runtime: DaemonRuntime;
	try {
		runtime = await (options.resolveRuntime ?? resolveDaemonRuntime)();
	} catch (error) {
		throw doctorError(`Could not resolve the ChatGPT Web runtime for account ${account.id}.`, error);
	}

	const result = await executeDoctor(runtime, account, options);
	if (result.error && result.error.code !== 1) throw commandError(account, result, options);
	const report = parseDoctorReport(result.stdout, account.id);
	validateDoctorResult(report, result.error?.code ?? 0, account.id);
	return adaptDoctorReport(report);
}

function executeDoctor(
	runtime: DaemonRuntime,
	account: InternetAccount,
	options: RunDaemonDoctorOptions,
): Promise<DoctorCommandResult> {
	const execFile = options.execFile ?? defaultExecFile;
	return new Promise((resolve, reject) => {
		try {
			execFile(
				runtime.launcher,
				["--home", account.configDir, "doctor", "--json"],
				{
					encoding: "utf8",
					env: { ...process.env, CODEX_CHATGPT_WEB_HOME: account.configDir },
					killSignal: "SIGKILL",
					maxBuffer: DOCTOR_MAX_BUFFER_BYTES,
					timeout: options.timeoutMs ?? DOCTOR_TIMEOUT_MS,
					...(options.signal ? { signal: options.signal } : {}),
				},
				(error, stdout, stderr) => resolve({ error, stdout, stderr }),
			);
		} catch (error) {
			reject(doctorError(`Could not start ChatGPT Web doctor for account ${account.id}.`, error));
		}
	});
}

function commandError(
	account: InternetAccount,
	result: DoctorCommandResult,
	options: RunDaemonDoctorOptions,
): InternetError {
	const error = result.error;
	if (options.signal?.aborted)
		return doctorError(`ChatGPT Web doctor was cancelled for account ${account.id}.`, error);
	if (error?.killed && error.code === null)
		return doctorError(
			`ChatGPT Web doctor timed out for account ${account.id} after ${options.timeoutMs ?? DOCTOR_TIMEOUT_MS}ms.`,
			error,
		);
	const detail = result.stderr.trim() || error?.message;
	return doctorError(`ChatGPT Web doctor failed for account ${account.id}${detail ? `: ${detail}` : "."}`, error);
}

function parseDoctorReport(raw: string, accountId: string): DaemonDoctorReport {
	let value: unknown;
	try {
		value = JSON.parse(raw);
	} catch (error) {
		throw doctorError(`ChatGPT Web doctor returned invalid JSON for account ${accountId}.`, error);
	}
	if (!isDoctorReport(value))
		throw doctorError(`ChatGPT Web doctor returned an invalid report for account ${accountId}.`);
	return value;
}

function isDoctorReport(value: unknown): value is DaemonDoctorReport {
	if (!isRecord(value) || typeof value.ok !== "boolean" || !Array.isArray(value.checks)) return false;
	if (value.mode !== undefined && value.mode !== "browser-only" && value.mode !== "full") return false;
	return value.checks.every(isDoctorCheck);
}

function isDoctorCheck(value: unknown): value is DaemonDoctorCheck {
	return (
		isRecord(value) &&
		typeof value.id === "string" &&
		(value.status === "ok" || value.status === "warning" || value.status === "error") &&
		typeof value.message === "string" &&
		(value.detail === undefined || typeof value.detail === "string")
	);
}

function validateDoctorResult(report: DaemonDoctorReport, exitCode: number | string, accountId: string): void {
	const checksOk = !report.checks.some((check) => check.status === "error");
	if (report.ok !== checksOk)
		throw doctorError(`ChatGPT Web doctor returned an inconsistent report for account ${accountId}.`);
	if ((exitCode === 0) !== report.ok)
		throw doctorError(`ChatGPT Web doctor returned an inconsistent exit status for account ${accountId}.`);
}

function adaptDoctorReport(report: DaemonDoctorReport): DoctorReport {
	const checks = report.checks.map((check) => ({ ...check, scope: doctorScope(check.id) }));
	return {
		ok: !checks.some((check) => check.scope === "pi" && check.status === "error"),
		upstreamOk: report.ok,
		...(report.mode ? { mode: report.mode } : {}),
		checks,
	};
}

function doctorScope(id: string): DoctorCheck["scope"] {
	switch (id) {
		case "config":
		case "browser-host":
		case "chrome":
		case "login":
		case "proxy":
			return "pi";
		case "codex":
		case "service":
		case "tools":
		case "tunnel-binary":
		case "tunnel-key":
		case "tunnel-service":
		case "tunnel-runtime":
		case "connector":
			return "upstream";
		default:
			throw doctorError(`ChatGPT Web doctor returned unknown check ${JSON.stringify(id)}.`);
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function doctorError(message: string, cause?: unknown): InternetError {
	return new InternetError(message, {
		code: "daemon_doctor_failed",
		...(cause === undefined ? {} : { cause }),
	});
}
