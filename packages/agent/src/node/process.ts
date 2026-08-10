import {
	type ChildProcess,
	type ChildProcessByStdio,
	spawn as nodeSpawn,
	spawnSync as nodeSpawnSync,
	type SpawnOptions,
	type SpawnOptionsWithStdioTuple,
	type SpawnSyncOptionsWithStringEncoding,
	type SpawnSyncReturns,
	type StdioNull,
	type StdioPipe,
} from "node:child_process";
import type { Readable } from "node:stream";
import { ExecutionError, toError } from "#agent/node/env/runtime";

const EXIT_STDIO_GRACE_MS = 100;
const TERMINATE_GRACE_MS = 5000;

export type ProcessReason = "completed" | "aborted" | "timeout" | "signal";

export interface ProcessOptions {
	cwd?: string;
	env?: NodeJS.ProcessEnv;
	shell?: boolean | string;
	detached?: boolean;
	signal?: AbortSignal;
	timeoutMs?: number;
	onSpawn?: (pid: number) => void;
	onStdout?: (chunk: Buffer) => void;
	onStderr?: (chunk: Buffer) => void;
}

export interface ProcessResult {
	exitCode: number | null;
	signal: NodeJS.Signals | null;
	reason: ProcessReason;
}

export function spawnProcess(
	command: string,
	args: string[],
	options: SpawnOptionsWithStdioTuple<StdioNull, StdioPipe, StdioPipe>,
): ChildProcessByStdio<null, Readable, Readable>;
export function spawnProcess(command: string, args: string[], options: SpawnOptions): ChildProcess;
export function spawnProcess(command: string, args: string[], options: SpawnOptions): ChildProcess {
	return nodeSpawn(command, args, options);
}

export function spawnProcessSync(
	command: string,
	args: string[],
	options: SpawnSyncOptionsWithStringEncoding,
): SpawnSyncReturns<string> {
	return nodeSpawnSync(command, args, options);
}

/**
 * Run a child process with byte-preserving output, cancellation, timeout, and
 * descendant cleanup for detached process groups.
 */
export async function runProcess(
	command: string,
	args: string[],
	options: ProcessOptions = {},
): Promise<ProcessResult> {
	if (options.signal?.aborted) {
		return { exitCode: null, signal: null, reason: "aborted" };
	}

	const child = spawnProcess(command, args, {
		cwd: options.cwd,
		env: options.env,
		shell: options.shell ?? false,
		detached: options.detached ?? false,
		stdio: ["ignore", "pipe", "pipe"],
	});

	let exitSignal: NodeJS.Signals | null = null;
	let reason: ProcessReason | undefined;
	let timeoutTimer: NodeJS.Timeout | undefined;
	let forceKillTimer: NodeJS.Timeout | undefined;
	let callbackError: ExecutionError | undefined;

	const kill = (signal: NodeJS.Signals): void => {
		if (child.pid === undefined) return;
		if (options.detached) {
			killProcessTree(child.pid, signal);
			return;
		}
		try {
			child.kill(signal);
		} catch {
			// The child may have exited between the state check and kill().
		}
	};

	const terminate = (nextReason: Exclude<ProcessReason, "completed" | "signal">): void => {
		if (reason !== undefined) return;
		reason = nextReason;
		if (timeoutTimer !== undefined) clearTimeout(timeoutTimer);
		kill("SIGTERM");
		forceKillTimer = setTimeout(() => kill("SIGKILL"), TERMINATE_GRACE_MS);
	};

	const failCallback = (error: unknown): void => {
		if (callbackError !== undefined) return;
		const cause = toError(error);
		callbackError = new ExecutionError("callback_error", cause.message, cause);
		terminate("aborted");
	};

	const emit = (callback: ((chunk: Buffer) => void) | undefined, chunk: Buffer): void => {
		if (callback === undefined || callbackError !== undefined) return;
		try {
			callback(chunk);
		} catch (error) {
			failCallback(error);
		}
	};

	const onExit = (_code: number | null, signal: NodeJS.Signals | null): void => {
		exitSignal = signal;
		if (reason === undefined) reason = signal === null ? "completed" : "signal";
	};
	const onAbort = (): void => terminate("aborted");
	const onTimeout = (): void => terminate("timeout");

	child.once("exit", onExit);
	child.stdout?.on("data", (chunk: Buffer) => emit(options.onStdout, chunk));
	child.stderr?.on("data", (chunk: Buffer) => emit(options.onStderr, chunk));

	try {
		if (child.pid !== undefined) {
			try {
				options.onSpawn?.(child.pid);
			} catch (error) {
				failCallback(error);
			}
		}

		if (options.signal !== undefined) {
			options.signal.addEventListener("abort", onAbort, { once: true });
		}
		if (options.timeoutMs !== undefined && options.timeoutMs > 0) {
			timeoutTimer = setTimeout(onTimeout, options.timeoutMs);
		}

		const exitCode = await waitForChildProcess(child);
		if (callbackError !== undefined) throw callbackError;
		return {
			exitCode,
			signal: exitSignal,
			reason: reason ?? (exitSignal === null ? "completed" : "signal"),
		};
	} catch (error) {
		if (callbackError !== undefined) throw callbackError;
		if (error instanceof ExecutionError) throw error;
		const cause = toError(error);
		throw new ExecutionError("spawn_error", cause.message, cause);
	} finally {
		if (timeoutTimer !== undefined) clearTimeout(timeoutTimer);
		if (forceKillTimer !== undefined) clearTimeout(forceKillTimer);
		if (options.signal !== undefined) options.signal.removeEventListener("abort", onAbort);
		child.removeListener("exit", onExit);
	}
}

/**
 * Wait for a child process to terminate without hanging on inherited stdio handles.
 *
 * A short-lived child can `exit` while a detached descendant keeps its stdout/stderr
 * pipe open. We must not resolve and destroy the streams on a fixed deadline measured
 * from `exit`, or output still being written past that deadline is silently lost
 * (tsuuanmi/pi#5303). Instead, after `exit` we wait for the pipes to fall idle:
 * the grace timer is re-armed on every chunk, so an actively writing descendant keeps
 * us reading, while a quiet inherited handle still releases us after the grace elapses.
 */
export function waitForChildProcess(child: ChildProcess): Promise<number | null> {
	return new Promise((resolve, reject) => {
		let settled = false;
		let exited = false;
		let exitCode: number | null = null;
		let postExitTimer: NodeJS.Timeout | undefined;
		let stdoutEnded = child.stdout === null;
		let stderrEnded = child.stderr === null;

		const cleanup = () => {
			if (postExitTimer) {
				clearTimeout(postExitTimer);
				postExitTimer = undefined;
			}
			child.removeListener("error", onError);
			child.removeListener("exit", onExit);
			child.removeListener("close", onClose);
			child.stdout?.removeListener("end", onStdoutEnd);
			child.stderr?.removeListener("end", onStderrEnd);
			child.stdout?.removeListener("data", onData);
			child.stderr?.removeListener("data", onData);
		};

		const finalize = (code: number | null) => {
			if (settled) return;
			settled = true;
			cleanup();
			child.stdout?.destroy();
			child.stderr?.destroy();
			resolve(code);
		};

		const maybeFinalizeAfterExit = () => {
			if (!exited || settled) return;
			if (stdoutEnded && stderrEnded) finalize(exitCode);
		};

		const armIdleTimer = () => {
			if (postExitTimer) clearTimeout(postExitTimer);
			postExitTimer = setTimeout(() => finalize(exitCode), EXIT_STDIO_GRACE_MS);
		};

		const onData = () => {
			// Output is still arriving after exit; defer finalizing so we don't
			// destroy the stream mid-write and truncate the tail.
			if (exited && !settled) armIdleTimer();
		};
		const onStdoutEnd = () => {
			stdoutEnded = true;
			maybeFinalizeAfterExit();
		};
		const onStderrEnd = () => {
			stderrEnded = true;
			maybeFinalizeAfterExit();
		};
		const onError = (error: Error) => {
			if (settled) return;
			settled = true;
			cleanup();
			reject(error);
		};
		const onExit = (code: number | null) => {
			exited = true;
			exitCode = code;
			maybeFinalizeAfterExit();
			if (!settled) armIdleTimer();
		};
		const onClose = (code: number | null) => finalize(code);

		child.stdout?.once("end", onStdoutEnd);
		child.stderr?.once("end", onStderrEnd);
		child.stdout?.on("data", onData);
		child.stderr?.on("data", onData);
		child.once("error", onError);
		child.once("exit", onExit);
		child.once("close", onClose);
	});
}

export function killProcessTree(pid: number, signal: NodeJS.Signals = "SIGKILL"): void {
	try {
		process.kill(-pid, signal);
		return;
	} catch {
		// The process group may already be gone.
	}
	try {
		process.kill(pid, signal);
	} catch {
		// The process may already be gone.
	}
}
