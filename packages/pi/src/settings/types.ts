import type { ThinkingLevel, Transport } from "@tsuuanmi/pi-ai";
import type { StatusLineSettings } from "@tsuuanmi/pi-tui";

export type { StatusLineSettings } from "@tsuuanmi/pi-tui";

export interface CompactionSettings {
	enabled?: boolean;
	reserveTokens?: number;
	keepRecentTokens?: number;
}

export interface BranchSummarySettings {
	reserveTokens?: number;
	skipPrompt?: boolean;
}

export interface ProviderRetrySettings {
	timeoutMs?: number;
	maxRetries?: number;
	maxRetryDelayMs?: number;
}

export interface RetrySettings {
	enabled?: boolean;
	maxRetries?: number;
	baseDelayMs?: number;
	provider?: ProviderRetrySettings;
}

export interface MarkdownSettings {
	codeBlockIndent?: string;
}

export interface ApiUsageLoggingSettings {
	enabled?: boolean;
}

export interface RetainedContextSettings {
	stripThinking?: boolean;
	compressBashOutput?: boolean;
	bashMaxBytes?: number;
	dedupeReadResults?: boolean;
	summarizeStaleToolResults?: boolean;
	toolResultMaxBytes?: number;
}

export type TransportSetting = Transport;

/**
 * Package source for npm/git packages.
 * - String form: load all resources from the package
 * - Object form: filter which resources to load
 */
export type PackageSource =
	| string
	| {
			source: string;
			extensions?: string[];
			skills?: string[];
			prompts?: string[];
			themes?: string[];
			commands?: string[];
			agents?: string[];
	  };

export interface ModelProviderSettings {
	name?: string;
	baseUrl?: string;
	apiKey?: string;
	api?: string;
	headers?: Record<string, string>;
	compat?: Record<string, unknown>;
	authHeader?: boolean;
	models?: Array<Record<string, unknown> & { id: string }>;
	modelOverrides?: Record<string, Record<string, unknown>>;
}

export interface ModelsSettings {
	providers?: Record<string, ModelProviderSettings>;
}

export interface Settings {
	providers?: Record<string, ModelProviderSettings>;
	defaultProvider?: string;
	defaultModel?: string;
	defaultThinkingLevel?: ThinkingLevel;
	agentModels?: Record<string, string>;
	agentThinkingLevels?: Record<string, ThinkingLevel>;
	transport?: TransportSetting;
	steeringMode?: "all" | "one-at-a-time";
	followUpMode?: "all" | "one-at-a-time";
	theme?: string;
	compaction?: CompactionSettings;
	branchSummary?: BranchSummarySettings;
	retry?: RetrySettings;
	hideThinkingBlock?: boolean;
	shellPath?: string;
	shellCommandPrefix?: string;
	npmCommand?: string[];
	packages?: PackageSource[];
	extensions?: string[];
	skills?: string[];
	prompts?: string[];
	themes?: string[];
	commands?: string[];
	enableSkillCommands?: boolean;
	enabledModels?: string[];
	showHardwareCursor?: boolean;
	markdown?: MarkdownSettings;
	apiUsageLogging?: ApiUsageLoggingSettings;
	retainedContext?: RetainedContextSettings;
	sessionDir?: string;
	httpProxy?: string;
	httpIdleTimeoutMs?: number;
	websocketConnectTimeoutMs?: number;
	statusLine?: StatusLineSettings;
}

export type SettingsScope = "global" | "project";

export interface SettingsStorage {
	read(scope: SettingsScope): string | undefined;
	update(scope: SettingsScope, update: (current: string | undefined) => string): void;
}

