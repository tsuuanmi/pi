import { DEFAULT_HTTP_IDLE_TIMEOUT_MS, parseHttpIdleTimeoutMs } from "#pi/network/http-dispatcher";
import type { SettingsStore } from "#pi/settings/store";
import type { StatusLineSettings } from "#pi/settings/types";

function parseTimeout(value: unknown, name: string): number | undefined {
	const timeout = parseHttpIdleTimeoutMs(value);
	if (timeout !== undefined) {
		return timeout;
	}
	if (value !== undefined) {
		throw new Error(`Invalid ${name} setting: ${String(value)}`);
	}
	return undefined;
}

export class BehaviorSettings {
	private readonly store: SettingsStore;

	constructor(store: SettingsStore) {
		this.store = store;
	}

	getCompactionEnabled(): boolean {
		return this.store.getSettings().compaction?.enabled ?? true;
	}

	setCompactionEnabled(enabled: boolean): void {
		this.store.updateGlobal(
			"compaction",
			(settings) => {
				settings.compaction = { ...(settings.compaction ?? {}), enabled };
			},
			"enabled",
		);
	}

	getCompactionReserveTokens(): number {
		return this.store.getSettings().compaction?.reserveTokens ?? 16_384;
	}

	getCompactionKeepRecentTokens(): number {
		return this.store.getSettings().compaction?.keepRecentTokens ?? 20_000;
	}

	getCompactionSettings(): { enabled: boolean; reserveTokens: number; keepRecentTokens: number } {
		const settings = this.store.getSettings();
		return {
			enabled: settings.compaction?.enabled ?? true,
			reserveTokens: settings.compaction?.reserveTokens ?? 16_384,
			keepRecentTokens: settings.compaction?.keepRecentTokens ?? 20_000,
		};
	}

	getBranchSummarySettings(): { reserveTokens: number; skipPrompt: boolean } {
		const settings = this.store.getSettings();
		return {
			reserveTokens: settings.branchSummary?.reserveTokens ?? 16_384,
			skipPrompt: settings.branchSummary?.skipPrompt ?? false,
		};
	}

	getBranchSummarySkipPrompt(): boolean {
		return this.store.getSettings().branchSummary?.skipPrompt ?? false;
	}

	getRetryEnabled(): boolean {
		return this.store.getSettings().retry?.enabled ?? true;
	}

	setRetryEnabled(enabled: boolean): void {
		this.store.updateGlobal(
			"retry",
			(settings) => {
				settings.retry = { ...(settings.retry ?? {}), enabled };
			},
			"enabled",
		);
	}

	getRetrySettings(): { enabled: boolean; maxRetries: number; baseDelayMs: number } {
		const settings = this.store.getSettings();
		return {
			enabled: settings.retry?.enabled ?? true,
			maxRetries: settings.retry?.maxRetries ?? 3,
			baseDelayMs: settings.retry?.baseDelayMs ?? 2_000,
		};
	}

	getHttpIdleTimeoutMs(): number {
		return (
			parseTimeout(this.store.getSettings().httpIdleTimeoutMs, "httpIdleTimeoutMs") ?? DEFAULT_HTTP_IDLE_TIMEOUT_MS
		);
	}

	setHttpIdleTimeoutMs(timeoutMs: number): void {
		if (!Number.isFinite(timeoutMs) || timeoutMs < 0) {
			throw new Error(`Invalid httpIdleTimeoutMs setting: ${String(timeoutMs)}`);
		}
		this.store.updateGlobal("httpIdleTimeoutMs", (settings) => {
			settings.httpIdleTimeoutMs = Math.floor(timeoutMs);
		});
	}

	getProviderRetrySettings(): { timeoutMs?: number; maxRetries?: number; maxRetryDelayMs: number } {
		const provider = this.store.getSettings().retry?.provider;
		return {
			timeoutMs: provider?.timeoutMs,
			maxRetries: provider?.maxRetries,
			maxRetryDelayMs: provider?.maxRetryDelayMs ?? 60_000,
		};
	}

	getWebSocketConnectTimeoutMs(): number | undefined {
		return parseTimeout(this.store.getSettings().websocketConnectTimeoutMs, "websocketConnectTimeoutMs");
	}

	getHideThinkingBlock(): boolean {
		return this.store.getSettings().hideThinkingBlock ?? false;
	}

	setHideThinkingBlock(hide: boolean): void {
		this.store.updateGlobal("hideThinkingBlock", (settings) => {
			settings.hideThinkingBlock = hide;
		});
	}

	getCodeBlockIndent(): string {
		return this.store.getSettings().markdown?.codeBlockIndent ?? "  ";
	}

	getApiUsageLoggingEnabled(): boolean {
		return this.store.getSettings().apiUsageLogging?.enabled ?? true;
	}

	getRetainedContextSettings(): {
		stripThinking: boolean;
		compressBashOutput: boolean;
		bashMaxBytes: number;
		dedupeReadResults: boolean;
		summarizeStaleToolResults: boolean;
		toolResultMaxBytes: number;
	} {
		const retained = this.store.getSettings().retainedContext;
		const bashMaxBytes = retained?.bashMaxBytes;
		const toolResultMaxBytes = retained?.toolResultMaxBytes;
		return {
			stripThinking: retained?.stripThinking ?? true,
			compressBashOutput: retained?.compressBashOutput ?? true,
			bashMaxBytes:
				typeof bashMaxBytes === "number" && Number.isFinite(bashMaxBytes) && bashMaxBytes > 0
					? Math.floor(bashMaxBytes)
					: 16_384,
			dedupeReadResults: retained?.dedupeReadResults ?? true,
			summarizeStaleToolResults: retained?.summarizeStaleToolResults ?? true,
			toolResultMaxBytes:
				typeof toolResultMaxBytes === "number" && Number.isFinite(toolResultMaxBytes) && toolResultMaxBytes > 0
					? Math.floor(toolResultMaxBytes)
					: 96_000,
		};
	}

	getStatusLine(): StatusLineSettings {
		return structuredClone(this.store.getSettings().statusLine ?? {});
	}
}
