import type { CustomMessage, Model } from "@tsuuanmi/pi-agent";
import type { TextContent } from "@tsuuanmi/pi-ai";
import type { ExtensionUIContext } from "#pi/api/ui-types";
import type { BuildSystemPromptOptions } from "#pi/loader/agents/system-prompt";
import type { ModelRegistry } from "#pi/loader/model-registry";
import type { CompactionResult } from "#pi/session/compaction/index";
import type { SessionManager } from "#pi/session/manager";
import type { SessionView } from "#pi/session/types";
import type { SubagentManager } from "#pi/subagents/manager";

export interface ContextUsage {
	tokens: number | null;
	contextWindow: number;
	percent: number | null;
}

export interface CompactOptions {
	customInstructions?: string;
	onComplete?: (result: CompactionResult) => void;
	onError?: (error: Error) => void;
}

export type ExtensionMode = "tui" | "rpc" | "json" | "print";

export interface ExtensionContext {
	ui: ExtensionUIContext;
	mode: ExtensionMode;
	hasUI: boolean;
	cwd: string;
	sessionManager: SessionView;
	modelRegistry: ModelRegistry;
	model: Model<any> | undefined;
	subagents?: SubagentManager;
	skipAutomaticContinuation: boolean;
	isIdle(): boolean;
	signal: AbortSignal | undefined;
	abort(): void;
	hasPendingMessages(): boolean;
	shutdown(): void;
	getContextUsage(): ContextUsage | undefined;
	compact(options?: CompactOptions): void;
	getSystemPrompt(): string;
}

export interface ExtensionCommandContext extends ExtensionContext {
	getSystemPromptOptions(): BuildSystemPromptOptions;
	waitForIdle(): Promise<void>;
	newSession(options?: {
		setup?: (sessionManager: SessionManager) => Promise<void>;
		withSession?: (ctx: ReplacedSessionContext) => Promise<void>;
	}): Promise<{ cancelled: boolean }>;
	navigateTree(
		targetId: string,
		options?: { summarize?: boolean; customInstructions?: string; replaceInstructions?: boolean; label?: string },
	): Promise<{ cancelled: boolean }>;
	switchSession(
		sessionPath: string,
		options?: { withSession?: (ctx: ReplacedSessionContext) => Promise<void> },
	): Promise<{ cancelled: boolean }>;
	reload(): Promise<void>;
}

export interface ReplacedSessionContext extends ExtensionCommandContext {
	sendMessage<T = unknown>(
		message: Pick<CustomMessage<T>, "customType" | "content" | "display" | "details">,
		options?: { triggerTurn?: boolean; deliverAs?: "steer" | "followUp" | "nextTurn" },
	): Promise<void>;
	sendUserMessage(content: string | TextContent[], options?: { deliverAs?: "steer" | "followUp" }): Promise<void>;
}
