import type { ChildProcess, ChildProcessByStdio } from "node:child_process";
import type { Readable } from "node:stream";
import { spawnProcess } from "@tsuuanmi/pi-agent/node";
import { getEnv } from "./environment.ts";
import type { CommandOutput } from "./types.ts";

export interface CommandOptions {
	cwd?: string;
	env?: Record<string, string>;
	timeoutMs?: number;
}

export class CommandRunner {
	private readonly output: CommandOutput;

	constructor(output: CommandOutput) {
		this.output = output;
	}

	spawn(command: string, args: string[], options?: Pick<CommandOptions, "cwd">): ChildProcess {
		return spawnProcess(command, args, {
			cwd: options?.cwd,
			stdio: this.output === "ignore" ? ["ignore", 2, 2] : "inherit",
			env: getEnv(),
		});
	}

	capture(command: string, args: string[], options?: CommandOptions): Promise<string> {
		return new Promise((resolvePromise, reject) => {
			const child = this.spawnCapture(command, args, options);
			let stdout = "";
			let stderr = "";
			let timedOut = false;
			const timeout =
				typeof options?.timeoutMs === "number"
					? setTimeout(() => {
							timedOut = true;
							child.kill();
						}, options.timeoutMs)
					: undefined;

			child.stdout?.on("data", (data) => {
				stdout += data.toString();
			});
			child.stderr?.on("data", (data) => {
				stderr += data.toString();
			});
			child.once("error", (error) => {
				if (timeout) clearTimeout(timeout);
				reject(error);
			});
			child.once("close", (code, signal) => {
				if (timeout) clearTimeout(timeout);
				if (timedOut) {
					reject(new Error(`${command} ${args.join(" ")} timed out after ${options?.timeoutMs}ms`));
					return;
				}
				if (code === 0) {
					resolvePromise(stdout.trim());
					return;
				}
				const exitStatus = code === null ? `signal ${signal ?? "unknown"}` : `code ${code}`;
				reject(new Error(`${command} ${args.join(" ")} failed with ${exitStatus}: ${stderr || stdout}`));
			});
		});
	}

	run(command: string, args: string[], options?: Pick<CommandOptions, "cwd">): Promise<void> {
		return new Promise((resolvePromise, reject) => {
			const child = this.spawn(command, args, options);
			child.on("error", reject);
			child.on("exit", (code) => {
				if (code === 0) {
					resolvePromise();
				} else {
					reject(new Error(`${command} ${args.join(" ")} failed with code ${code}`));
				}
			});
		});
	}

	private spawnCapture(
		command: string,
		args: string[],
		options?: CommandOptions,
	): ChildProcessByStdio<null, Readable, Readable> {
		const baseEnv = getEnv();
		const env = options?.env ? { ...baseEnv, ...options.env } : baseEnv;
		return spawnProcess(command, args, {
			cwd: options?.cwd,
			stdio: ["ignore", "pipe", "pipe"],
			env,
		});
	}
}
