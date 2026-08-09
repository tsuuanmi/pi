import type { Agent } from "@tsuuanmi/pi-agent";
import type { AssistantMessage, Model, ThinkingLevel } from "@tsuuanmi/pi-ai";
import { isContextOverflow, stream } from "@tsuuanmi/pi-ai";
import { formatNoModelSelectedMessage } from "#pi/auth/guidance";
import type { SessionBeforeCompactResult } from "#pi/loader/extensions/index";
import type { ModelRegistry } from "#pi/loader/model-registry";
import type { ExtensionRunner } from "#pi/runtime/extensions/runner";
import type { AgentSessionEvent } from "#pi/runtime/session/types";
import {
	type CompactionResult,
	calculateContextTokens,
	estimateContextTokens,
	compact as generateCompaction,
	prepareCompaction,
	shouldCompact,
} from "#pi/session/compaction/index";
import { type CompactionEntry, getLatestCompactionEntry, type SessionManager } from "#pi/session/manager";
import type { SettingsManager } from "#pi/settings/settings-manager";

export interface CompactionHost {
	readonly agent: Agent;
	readonly sessionManager: SessionManager;
	readonly settingsManager: SettingsManager;
	readonly modelRegistry: ModelRegistry;
	readonly extensionRunner: ExtensionRunner;
	readonly model: Model<any> | undefined;
	readonly thinkingLevel: ThinkingLevel;
	getCompactionRequestAuth(
		model: Model<any>,
	): Promise<{ apiKey?: string; headers?: Record<string, string>; env?: Record<string, string> }>;
	disconnect(): void;
	reconnect(): void;
	abort(): Promise<void>;
	emit(event: AgentSessionEvent): void;
}

type RequestAuth = {
	apiKey?: string;
	headers?: Record<string, string>;
	env?: Record<string, string>;
};

type CompactionExecution = {
	cancelled: boolean;
	result?: CompactionResult;
};

export class CompactionController {
	private readonly host: CompactionHost;
	private abortController: AbortController | undefined;
	private autoAbortController: AbortController | undefined;
	private overflowRecoveryAttempted = false;

	constructor(host: CompactionHost) {
		this.host = host;
	}

	get isRunning(): boolean {
		return this.abortController !== undefined || this.autoAbortController !== undefined;
	}

	/**
	 * Manually compact the session context.
	 * Aborts current agent operation first.
	 * @param customInstructions Optional instructions for the compaction summary
	 */
	async compact(customInstructions?: string): Promise<CompactionResult> {
		this.host.disconnect();
		await this.host.abort();
		this.abortController = new AbortController();
		this.host.emit({ type: "compaction_start", reason: "manual" });

		try {
			const model = this.host.model;
			if (!model) throw new Error(formatNoModelSelectedMessage());

			const auth = await this.host.getCompactionRequestAuth(model);
			const execution = await this.executeCompaction(model, auth, this.abortController.signal, customInstructions);
			if (execution.cancelled) throw new Error("Compaction cancelled");
			if (!execution.result) {
				const pathEntries = this.host.sessionManager.getBranch();
				const lastEntry = pathEntries[pathEntries.length - 1];
				if (lastEntry?.type === "compaction") throw new Error("Already compacted");
				throw new Error("Nothing to compact (session too small)");
			}

			this.host.emit({
				type: "compaction_end",
				reason: "manual",
				result: execution.result,
				aborted: false,
				willRetry: false,
			});
			return execution.result;
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			const aborted = message === "Compaction cancelled" || (error instanceof Error && error.name === "AbortError");
			this.host.emit({
				type: "compaction_end",
				reason: "manual",
				result: undefined,
				aborted,
				willRetry: false,
				errorMessage: aborted ? undefined : `Compaction failed: ${message}`,
			});
			throw error;
		} finally {
			this.abortController = undefined;
			this.host.reconnect();
		}
	}

	private async executeCompaction(
		model: Model<any>,
		auth: RequestAuth,
		signal: AbortSignal,
		customInstructions?: string,
	): Promise<CompactionExecution> {
		const pathEntries = this.host.sessionManager.getBranch();
		const preparation = prepareCompaction(pathEntries, this.host.settingsManager.getCompactionSettings());
		if (!preparation) return { cancelled: false };

		let result: CompactionResult | undefined;
		let fromExtension = false;
		if (this.host.extensionRunner.hasHandlers("session_before_compact")) {
			const extensionResult = (await this.host.extensionRunner.emit({
				type: "session_before_compact",
				preparation,
				branchEntries: pathEntries,
				customInstructions,
				signal,
			})) as SessionBeforeCompactResult | undefined;

			if (extensionResult?.cancel) return { cancelled: true };
			if (extensionResult?.compaction) {
				result = extensionResult.compaction;
				fromExtension = true;
			}
		}

		if (!result) {
			result = await generateCompaction(
				preparation,
				model,
				auth.apiKey,
				auth.headers,
				customInstructions,
				signal,
				this.host.thinkingLevel,
				this.host.agent.stream,
				auth.env,
			);
		}

		if (signal.aborted) return { cancelled: true };

		this.host.sessionManager.appendCompaction(
			result.summary,
			result.firstKeptEntryId,
			result.tokensBefore,
			result.details,
			fromExtension,
		);
		const entries = this.host.sessionManager.getEntries();
		this.host.agent.state.messages = this.host.sessionManager.buildSessionContext().messages;

		const savedEntry = entries.find((entry) => entry.type === "compaction" && entry.summary === result.summary) as
			| CompactionEntry
			| undefined;
		if (savedEntry) {
			await this.host.extensionRunner.emit({
				type: "session_compact",
				compactionEntry: savedEntry,
				fromExtension,
			});
		}

		return { cancelled: false, result };
	}

	/**
	 * Cancel in-progress compaction (manual or auto).
	 */
	abortCompaction(): void {
		this.abortController?.abort();
		this.autoAbortController?.abort();
	}

	resetOverflowRecovery(): void {
		this.overflowRecoveryAttempted = false;
	}

	/**
	 * Check if compaction is needed and run it.
	 * Called after agent_end and before prompt submission.
	 *
	 * Two cases:
	 * 1. Overflow: LLM returned context overflow error, remove error message from agent state, compact, auto-retry
	 * 2. Threshold: Context over threshold, compact, NO auto-retry (user continues manually)
	 *
	 * @param assistantMessage The assistant message to check
	 * @param skipAbortedCheck If false, include aborted messages (for pre-prompt check). Default: true
	 */
	async check(assistantMessage: AssistantMessage, skipAbortedCheck = true): Promise<boolean> {
		const settings = this.host.settingsManager.getCompactionSettings();
		if (!settings.enabled) return false;

		// Skip if message was aborted (user cancelled) - unless skipAbortedCheck is false
		if (skipAbortedCheck && assistantMessage.stopReason === "aborted") return false;

		const contextWindow = this.host.model?.contextWindow ?? 0;

		// Skip overflow check if the message came from a different model.
		// This handles the case where user switched from a smaller-context model (e.g. opus)
		// to a larger-context model (e.g. codex) - the overflow error from the old model
		// shouldn't trigger compaction for the new model.
		const sameModel =
			this.host.model &&
			assistantMessage.provider === this.host.model.provider &&
			assistantMessage.model === this.host.model.id;

		// Skip compaction checks if this assistant message is older than the latest
		// compaction boundary. This prevents a stale pre-compaction usage/error
		// from retriggering compaction on the first prompt after compaction.
		const compactionEntry = getLatestCompactionEntry(this.host.sessionManager.getBranch());
		const assistantIsFromBeforeCompaction =
			compactionEntry !== null && assistantMessage.timestamp <= new Date(compactionEntry.timestamp).getTime();
		if (assistantIsFromBeforeCompaction) {
			return false;
		}

		// Case 1: Overflow - LLM returned context overflow error
		if (sameModel && isContextOverflow(assistantMessage, contextWindow)) {
			if (this.overflowRecoveryAttempted) {
				this.host.emit({
					type: "compaction_end",
					reason: "overflow",
					result: undefined,
					aborted: false,
					willRetry: false,
					errorMessage:
						"Context overflow recovery failed after one compact-and-retry attempt. Try reducing context or switching to a larger-context model.",
				});
				return false;
			}

			this.overflowRecoveryAttempted = true;
			// Remove the error message from agent state (it IS saved to session for history,
			// but we don't want it in context for the retry)
			const messages = this.host.agent.state.messages;
			if (messages.length > 0 && messages[messages.length - 1].role === "assistant") {
				this.host.agent.state.messages = messages.slice(0, -1);
			}
			return await this.runAutoCompaction("overflow", true);
		}

		// Case 2: Threshold - context is getting large
		// For error messages (no usage data), estimate from last successful response.
		// This ensures sessions that hit persistent API errors (e.g. 529) can still compact.
		let contextTokens: number;
		if (assistantMessage.stopReason === "error") {
			const messages = this.host.agent.state.messages;
			const estimate = estimateContextTokens(messages);
			if (estimate.lastUsageIndex === null) return false; // No usage data at all
			// Verify the usage source is post-compaction. Kept pre-compaction messages
			// have stale usage reflecting the old (larger) context and would falsely
			// trigger compaction right after one just finished.
			const usageMsg = messages[estimate.lastUsageIndex];
			if (
				compactionEntry &&
				usageMsg.role === "assistant" &&
				(usageMsg as AssistantMessage).timestamp <= new Date(compactionEntry.timestamp).getTime()
			) {
				return false;
			}
			contextTokens = estimate.tokens;
		} else {
			contextTokens = calculateContextTokens(assistantMessage.usage);
		}
		if (shouldCompact(contextTokens, contextWindow, settings)) {
			return await this.runAutoCompaction("threshold", false);
		}
		return false;
	}

	/**
	 * Internal: Run auto-compaction with events.
	 */
	private async runAutoCompaction(reason: "overflow" | "threshold", willRetry: boolean): Promise<boolean> {
		this.host.emit({ type: "compaction_start", reason });
		this.autoAbortController = new AbortController();

		try {
			const model = this.host.model;
			if (!model) {
				this.host.emit({ type: "compaction_end", reason, result: undefined, aborted: false, willRetry: false });
				return false;
			}

			const auth = await this.getAutoAuth(model);
			if (!auth) {
				this.host.emit({ type: "compaction_end", reason, result: undefined, aborted: false, willRetry: false });
				return false;
			}

			const execution = await this.executeCompaction(model, auth, this.autoAbortController.signal);
			if (execution.cancelled) {
				this.host.emit({ type: "compaction_end", reason, result: undefined, aborted: true, willRetry: false });
				return false;
			}
			if (!execution.result) {
				this.host.emit({ type: "compaction_end", reason, result: undefined, aborted: false, willRetry: false });
				return false;
			}

			this.host.emit({ type: "compaction_end", reason, result: execution.result, aborted: false, willRetry });
			if (willRetry) {
				const messages = this.host.agent.state.messages;
				const lastMessage = messages[messages.length - 1];
				if (lastMessage?.role === "assistant" && (lastMessage as AssistantMessage).stopReason === "error") {
					this.host.agent.state.messages = messages.slice(0, -1);
				}
				return true;
			}

			return this.host.agent.hasQueuedMessages();
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : "compaction failed";
			this.host.emit({
				type: "compaction_end",
				reason,
				result: undefined,
				aborted: false,
				willRetry: false,
				errorMessage:
					reason === "overflow"
						? `Context overflow recovery failed: ${errorMessage}`
						: `Auto-compaction failed: ${errorMessage}`,
			});
			return false;
		} finally {
			this.autoAbortController = undefined;
		}
	}

	private async getAutoAuth(model: Model<any>): Promise<RequestAuth | undefined> {
		if (this.host.agent.stream === stream) {
			const auth = await this.host.modelRegistry.getApiKeyAndHeaders(model);
			if (!auth.ok || !auth.apiKey) return undefined;
			return { apiKey: auth.apiKey, headers: auth.headers, env: auth.env };
		}
		return this.host.getCompactionRequestAuth(model);
	}

	/**
	 * Toggle auto-compaction setting.
	 */
	setAutoCompactionEnabled(enabled: boolean): void {
		this.host.settingsManager.setCompactionEnabled(enabled);
	}

	/** Whether auto-compaction is enabled */
	get autoCompactionEnabled(): boolean {
		return this.host.settingsManager.getCompactionEnabled();
	}
}
