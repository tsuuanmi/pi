import type { Agent, BashExecutionMessage } from "@tsuuanmi/pi-agent";
import type { BashOperations } from "#pi/execution/backend";
import { type BashResult, runBash } from "#pi/execution/bash";
import { createLocalBash } from "#pi/execution/local";
import type { SessionManager } from "#pi/session/manager";
import type { SettingsManager } from "#pi/settings/settings-manager";

export interface BashHost {
	readonly agent: Agent;
	readonly sessionManager: SessionManager;
	readonly settingsManager: SettingsManager;
	isStreaming(): boolean;
}

export class BashController {
	private readonly host: BashHost;
	private abortController: AbortController | undefined;
	private pendingMessages: BashExecutionMessage[] = [];

	constructor(host: BashHost) {
		this.host = host;
	}

	async execute(
		command: string,
		onChunk?: (chunk: string) => void,
		options?: { excludeFromContext?: boolean; operations?: BashOperations },
	): Promise<BashResult> {
		this.abortController = new AbortController();

		const prefix = this.host.settingsManager.getShellCommandPrefix();
		const shellPath = this.host.settingsManager.getShellPath();
		const resolvedCommand = prefix ? `${prefix}\n${command}` : command;

		try {
			const result = await runBash(
				resolvedCommand,
				this.host.sessionManager.getCwd(),
				options?.operations ?? createLocalBash({ shellPath }),
				{
					onChunk,
					signal: this.abortController.signal,
				},
			);

			this.record(command, result, { excludeFromContext: options?.excludeFromContext });
			return result;
		} finally {
			this.abortController = undefined;
		}
	}

	record(command: string, result: BashResult, options?: { excludeFromContext?: boolean }): void {
		const message: BashExecutionMessage = {
			role: "bashExecution",
			command,
			output: result.output,
			exitCode: result.exitCode,
			cancelled: result.cancelled,
			truncated: result.truncated,
			fullOutputPath: result.fullOutputPath,
			timestamp: Date.now(),
			excludeFromContext: options?.excludeFromContext,
		};

		if (this.host.isStreaming()) {
			this.pendingMessages.push(message);
			return;
		}

		this.host.agent.state.messages.push(message);
		this.host.sessionManager.appendMessage(message);
	}

	abort(): void {
		this.abortController?.abort();
	}

	get isRunning(): boolean {
		return this.abortController !== undefined;
	}

	get hasPendingMessages(): boolean {
		return this.pendingMessages.length > 0;
	}

	flush(): void {
		if (this.pendingMessages.length === 0) return;

		for (const message of this.pendingMessages) {
			this.host.agent.state.messages.push(message);
			this.host.sessionManager.appendMessage(message);
		}

		this.pendingMessages = [];
	}
}
