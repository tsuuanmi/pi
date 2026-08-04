import type { Agent, AgentEvent } from "@tsuuanmi/pi-agent";
import type { AssistantMessage, Model } from "@tsuuanmi/pi-ai";
import { isContextOverflow } from "@tsuuanmi/pi-ai";
import { sleep } from "#pi/runtime/platform";
import type { AgentSessionEvent } from "#pi/runtime/session/types";
import type { SettingsManager } from "#pi/settings/settings-manager";

export interface RetryHost {
	readonly agent: Agent;
	readonly settingsManager: SettingsManager;
	getModel(): Model<any> | undefined;
	emit(event: AgentSessionEvent): void;
}

export class RetryController {
	private readonly host: RetryHost;
	private abortController: AbortController | undefined;
	private attempt = 0;

	constructor(host: RetryHost) {
		this.host = host;
	}

	isRetryable(message: AssistantMessage): boolean {
		if (message.stopReason !== "error" || !message.errorMessage) return false;

		const contextWindow = this.host.getModel()?.contextWindow ?? 0;
		if (isContextOverflow(message, contextWindow)) return false;

		const error = message.errorMessage;
		if (this.isProviderLimit(error)) return false;

		return /overloaded|provider.?returned.?error|rate.?limit|too many requests|429|500|502|503|504|service.?unavailable|server.?error|internal.?error|network.?error|connection.?error|connection.?refused|connection.?lost|websocket.?closed|websocket.?error|other side closed|fetch failed|upstream.?connect|reset before headers|socket hang up|ended without|stream ended before message_stop|http2 request did not get a response|timed? out|timeout|terminated|retry delay/i.test(
			error,
		);
	}

	willRetryAfterEnd(event: Extract<AgentEvent, { type: "agent_end" }>): boolean {
		const settings = this.host.settingsManager.getRetrySettings();
		if (!settings.enabled || this.attempt >= settings.maxRetries) return false;

		for (let index = event.messages.length - 1; index >= 0; index -= 1) {
			const message = event.messages[index];
			if (message.role === "assistant") {
				return this.isRetryable(message);
			}
		}
		return false;
	}

	async prepare(message: AssistantMessage): Promise<boolean> {
		const settings = this.host.settingsManager.getRetrySettings();
		if (!settings.enabled) return false;

		this.attempt += 1;
		if (this.attempt > settings.maxRetries) {
			this.attempt -= 1;
			return false;
		}

		const delayMs = settings.baseDelayMs * 2 ** (this.attempt - 1);
		this.host.emit({
			type: "auto_retry_start",
			attempt: this.attempt,
			maxAttempts: settings.maxRetries,
			delayMs,
			errorMessage: message.errorMessage || "Unknown error",
		});

		const messages = this.host.agent.state.messages;
		if (messages.length > 0 && messages[messages.length - 1].role === "assistant") {
			this.host.agent.state.messages = messages.slice(0, -1);
		}

		this.abortController = new AbortController();
		try {
			await sleep(delayMs, this.abortController.signal);
		} catch {
			const attempt = this.attempt;
			this.attempt = 0;
			this.host.emit({
				type: "auto_retry_end",
				success: false,
				attempt,
				finalError: "Retry cancelled",
			});
			return false;
		} finally {
			this.abortController = undefined;
		}

		return true;
	}

	finish(message: AssistantMessage): void {
		if (message.stopReason !== "error" || this.attempt === 0) return;

		this.host.emit({
			type: "auto_retry_end",
			success: false,
			attempt: this.attempt,
			finalError: message.errorMessage,
		});
		this.attempt = 0;
	}

	resetAfterSuccess(message: AssistantMessage): void {
		if (message.stopReason === "error" || this.attempt === 0) return;

		this.host.emit({
			type: "auto_retry_end",
			success: true,
			attempt: this.attempt,
		});
		this.attempt = 0;
	}

	abort(): void {
		this.abortController?.abort();
	}

	get isRetrying(): boolean {
		return this.abortController !== undefined;
	}

	get retryAttempt(): number {
		return this.attempt;
	}

	get enabled(): boolean {
		return this.host.settingsManager.getRetryEnabled();
	}

	setEnabled(enabled: boolean): void {
		this.host.settingsManager.setRetryEnabled(enabled);
	}

	private isProviderLimit(error: string): boolean {
		return /GoUsageLimitError|FreeUsageLimitError|Monthly usage limit reached|available balance|insufficient_quota|out of budget|quota exceeded|billing/i.test(
			error,
		);
	}
}
