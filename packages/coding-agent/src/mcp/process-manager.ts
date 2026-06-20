/**
 * MCP subprocess lifecycle management.
 *
 * Manages spawning, signal handling, and cleanup for MCP server processes
 * using Node `child_process.spawn`. Equivalent to gajae-code's OwnedProcess
 * but Pi-native — no external dependencies.
 */

import { type ChildProcess, spawn } from "node:child_process";

export interface OwnedProcessOptions {
	command: string;
	args?: string[];
	env?: Record<string, string>;
	cwd?: string;
}

export interface OwnedProcess {
	readonly pid: number | undefined;
	readonly exited: boolean;
	readonly process: ChildProcess | undefined;
	start(): Promise<void>;
	kill(signal?: NodeJS.Signals): Promise<void>;
	onExit(handler: (code: number | null, signal: NodeJS.Signals | null) => void): () => void;
	sendStdin(data: Buffer): void;
}

/**
 * Manage an MCP server subprocess.
 *
 * Handles spawn, SIGTERM/SIGKILL escalation, orphan cleanup,
 * and proper stdin/stdout/stderr pipe management.
 */
export function createOwnedProcess(options: OwnedProcessOptions): OwnedProcess {
	let child: ChildProcess | undefined;
	let exited = false;
	const exitHandlers: Array<(code: number | null, signal: NodeJS.Signals | null) => void> = [];
	let startPromise: Promise<void> | undefined;

	const env = {
		...process.env,
		...options.env,
	};

	const start = (): Promise<void> => {
		if (startPromise) return startPromise;

		startPromise = new Promise<void>((resolve, reject) => {
			child = spawn(options.command, options.args ?? [], {
				cwd: options.cwd,
				env,
				stdio: ["pipe", "pipe", "pipe"],
				detached: false,
			});

			if (!child.pid) {
				// Process didn't spawn — wait for error event
				child.on("error", (err) => {
					reject(new Error(`Failed to start MCP server "${options.command}": ${err.message}`));
				});
				return;
			}

			child.on("error", (err) => {
				if (!exited) {
					reject(new Error(`MCP server "${options.command}" error: ${err.message}`));
				}
			});

			child.on("exit", (code, signal) => {
				exited = true;
				for (const handler of exitHandlers) {
					handler(code, signal as NodeJS.Signals | null);
				}
			});

			resolve();
		});

		return startPromise;
	};

	const kill = (signal: NodeJS.Signals = "SIGTERM"): Promise<void> => {
		return new Promise((resolve) => {
			if (!child || exited) {
				resolve();
				return;
			}

			let resolved = false;
			const finish = () => {
				if (resolved) return;
				resolved = true;
				resolve();
			};

			const exitHandler = () => {
				finish();
			};

			child.on("exit", exitHandler);

			try {
				child.kill(signal);
			} catch {
				finish();
				return;
			}

			if (signal === "SIGTERM") {
				// Escalate to SIGKILL after 5 seconds
				setTimeout(() => {
					if (!exited && child) {
						try {
							child.kill("SIGKILL");
						} catch {
							// Already dead
						}
					}
				}, 5000);
			}

			// Safety timeout
			setTimeout(finish, 10000);
		});
	};

	const onExit = (handler: (code: number | null, signal: NodeJS.Signals | null) => void): (() => void) => {
		exitHandlers.push(handler);
		return () => {
			const index = exitHandlers.indexOf(handler);
			if (index !== -1) {
				exitHandlers.splice(index, 1);
			}
		};
	};

	const sendStdin = (data: Buffer): void => {
		if (!child || exited) {
			throw new Error("Cannot send data to MCP server: process not running");
		}
		child.stdin?.write(data);
	};

	return {
		get pid() {
			return child?.pid;
		},
		get exited() {
			return exited;
		},
		get process() {
			return child;
		},
		start,
		kill,
		onExit,
		sendStdin,
	};
}
