import { constants } from "node:fs";
import { access as accessFile } from "node:fs/promises";
import { ExecutionError, resolveShell, runProcess } from "@tsuuanmi/pi-agent/node";
import type { BashOperations } from "#pi/execution/backend";
import { track, untrack } from "#pi/execution/lifecycle";
import { getShellEnv } from "#pi/execution/shell";

export function createLocalBash(options?: { shellPath?: string }): BashOperations {
	return {
		exec: async (command, cwd, { onData, signal, timeoutSeconds, env }) => {
			try {
				await accessFile(cwd, constants.F_OK);
			} catch {
				throw new Error(`Working directory does not exist: ${cwd}\nCannot execute bash commands.`);
			}
			if (signal?.aborted) throw new ExecutionError("aborted", "Command aborted");

			let shell: ReturnType<typeof resolveShell>;
			try {
				shell = resolveShell(options?.shellPath);
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				throw new ExecutionError("shell_unavailable", message, error instanceof Error ? error : undefined);
			}

			let pid: number | undefined;
			try {
				const result = await runProcess(shell.shell, [...shell.args, command], {
					cwd,
					detached: true,
					env: getShellEnv(env),
					signal,
					timeoutMs: timeoutSeconds === undefined ? undefined : timeoutSeconds * 1000,
					onSpawn: (childPid) => {
						pid = childPid;
						track(childPid);
					},
					onStdout: onData,
					onStderr: onData,
				});

				if (result.reason === "aborted") throw new ExecutionError("aborted", "Command aborted");
				if (result.reason === "timeout") {
					throw new ExecutionError("timeout", `Command timed out after ${timeoutSeconds} seconds`);
				}
				return { exitCode: result.exitCode };
			} finally {
				if (pid !== undefined) untrack(pid);
			}
		},
	};
}
