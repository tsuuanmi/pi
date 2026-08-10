/** Public contracts for the agent session runtime. */

import type { Agent, AgentEvent, AgentMessage, Model, ThinkingLevel, Tool } from "@tsuuanmi/pi-agent";
import type {
	ContextUsage,
	ExtensionCommandContextActions,
	ExtensionMode,
	ExtensionUIContext,
	InputSource,
	SessionStartEvent,
} from "#pi/loader/extensions/index";
import type { ModelRegistry } from "#pi/loader/model-registry";
import type { ResourceLoader } from "#pi/loader/resources";
import type { ExtensionErrorListener, ExtensionRunner, ShutdownHandler } from "#pi/runtime/extensions/runner";
import type { CompactionResult } from "#pi/session/compaction/index";
import type { SessionManager } from "#pi/session/manager";
import type { SettingsManager } from "#pi/settings/manager";
import type { SubagentManager } from "#pi/subagents/manager";

/** Session-specific events that extend the core AgentEvent. */
export type AgentSessionEvent =
	| Exclude<AgentEvent, { type: "agent_end" }>
	| {
			type: "agent_end";
			messages: AgentMessage[];
			willRetry: boolean;
	  }
	| {
			type: "queue_update";
			steering: readonly string[];
			followUp: readonly string[];
	  }
	| { type: "compaction_start"; reason: "manual" | "threshold" | "overflow" }
	| { type: "session_info_changed"; name: string | undefined }
	| { type: "thinking_level_changed"; level: ThinkingLevel }
	| {
			type: "compaction_end";
			reason: "manual" | "threshold" | "overflow";
			result: CompactionResult | undefined;
			aborted: boolean;
			willRetry: boolean;
			errorMessage?: string;
	  }
	| { type: "auto_retry_start"; attempt: number; maxAttempts: number; delayMs: number; errorMessage: string }
	| { type: "auto_retry_end"; success: boolean; attempt: number; finalError?: string }
	| {
			type: "structured_output";
			ok: boolean;
			attempt: number;
			error?: string;
			issues?: string[];
			preview?: string;
	  };

/** Listener function for agent session events. */
export type AgentSessionEventListener = (event: AgentSessionEvent) => void;

export interface AgentSessionConfig {
	agent: Agent;
	sessionManager: SessionManager;
	settingsManager: SettingsManager;
	cwd: string;
	/** Models to cycle through with Ctrl+P. */
	scopedModels?: Array<{ model: Model<any>; thinkingLevel?: ThinkingLevel }>;
	/** Resource loader for skills, prompts, themes, context files, and system prompt. */
	resourceLoader: ResourceLoader;
	/** SDK custom tools registered outside extensions. */
	customTools?: Tool[];
	/** Model registry for API key resolution and model discovery. */
	modelRegistry: ModelRegistry;
	/** Initial active built-in tool names. */
	initialActiveToolNames?: string[];
	/** Optional allowlist of tool names. */
	allowedToolNames?: string[];
	/** Optional denylist of tool names. */
	excludedToolNames?: string[];
	/** Override base tools for custom runtimes. */
	baseToolsOverride?: Record<string, Tool>;
	/** Mutable ref used by Agent to access the current ExtensionRunner. */
	extensionRunnerRef?: { current?: ExtensionRunner };
	/** Session start event metadata emitted when extensions bind to this runtime. */
	sessionStartEvent?: SessionStartEvent;
	/** Optional Pi-native subagent manager. */
	subagentManager?: SubagentManager | null;
	/** Skip automatic continuation prompt injection. */
	skipAutomaticContinuation?: boolean;
	/** Extra system prompt appended to the rebuilt base prompt. */
	extraSystemPrompt?: string;
	/** Optional override for API-usage log routing. */
	apiUsageSessionId?: string;
}

export interface ExtensionBindings {
	uiContext?: ExtensionUIContext;
	mode?: ExtensionMode;
	commandContextActions?: ExtensionCommandContextActions;
	abortHandler?: () => void;
	shutdownHandler?: ShutdownHandler;
	onError?: ExtensionErrorListener;
}

/** Options for AgentSession.prompt(). */
export interface PromptOptions {
	/** Whether to expand file-based prompt templates. */
	expandPromptTemplates?: boolean;
	/** How to queue a message while streaming. */
	streamingBehavior?: "steer" | "followUp";
	/** Source of input for extension input handlers. */
	source?: InputSource;
	/** Hook used by RPC mode to observe prompt preflight acceptance or rejection. */
	preflightResult?: (success: boolean) => void;
}

/** Result from cycleModel(). */
export interface ModelCycleResult {
	model: Model<any>;
	thinkingLevel: ThinkingLevel;
	/** Whether cycling through scoped models or all available. */
	isScoped: boolean;
}

/** Session statistics for the session command. */
export interface SessionStats {
	sessionFile: string | undefined;
	sessionId: string;
	userMessages: number;
	assistantMessages: number;
	toolCalls: number;
	toolResults: number;
	totalMessages: number;
	tokens: {
		input: number;
		output: number;
		cacheRead: number;
		cacheWrite: number;
		total: number;
	};
	cost: number;
	contextUsage?: ContextUsage;
}
