import { type ProcessReason, runProcess } from "@tsuuanmi/pi-agent/node";

export interface ProgramOptions {
	signal?: AbortSignal;
	timeoutMs?: number;
	cwd?: string;
}

export interface ProgramResult {
	stdout: string;
	stderr: string;
	exitCode: number | null;
	signal: NodeJS.Signals | null;
	reason: ProcessReason;
}

export async function runProgram(
	command: string,
	args: string[],
	options: ProgramOptions = {},
): Promise<ProgramResult> {
	let stdout = "";
	let stderr = "";
	const stdoutDecoder = new TextDecoder();
	const stderrDecoder = new TextDecoder();

	const result = await runProcess(command, args, {
		cwd: options.cwd,
		signal: options.signal,
		timeoutMs: options.timeoutMs,
		onStdout: (chunk) => {
			stdout += stdoutDecoder.decode(chunk, { stream: true });
		},
		onStderr: (chunk) => {
			stderr += stderrDecoder.decode(chunk, { stream: true });
		},
	});

	stdout += stdoutDecoder.decode();
	stderr += stderrDecoder.decode();
	return {
		stdout,
		stderr,
		exitCode: result.exitCode,
		signal: result.signal,
		reason: result.reason,
	};
}
