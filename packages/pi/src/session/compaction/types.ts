import type { AgentMessage, FileOperations, StreamFunction } from "@tsuuanmi/pi-agent";
import type { Model } from "@tsuuanmi/pi-ai";
import type { SessionEntry } from "#pi/session/manager";

export type { FileOperations } from "@tsuuanmi/pi-agent";

/** Details stored in CompactionEntry.details for file tracking. */
export interface CompactionDetails {
	readFiles: string[];
	modifiedFiles: string[];
}

export interface CompactionSettings {
	enabled: boolean;
	reserveTokens: number;
	keepRecentTokens: number;
}

export interface ContextUsageEstimate {
	tokens: number;
	usageTokens: number;
	trailingTokens: number;
	lastUsageIndex: number | null;
}

export interface CutPointResult {
	/** Index of first entry to keep. */
	firstKeptEntryIndex: number;
	/** Index of the turn start when the cut splits a turn, otherwise -1. */
	turnStartIndex: number;
	/** Whether the cut splits a turn. */
	isSplitTurn: boolean;
}

/** Result from compact(); SessionManager adds uuid/parentUuid when saving. */
export interface CompactionResult<T = unknown> {
	summary: string;
	firstKeptEntryId: string;
	tokensBefore: number;
	/** Extension-specific data, such as artifact indexes or version markers. */
	details?: T;
}

export interface CompactionPreparation {
	/** UUID of first entry to keep. */
	firstKeptEntryId: string;
	/** Messages that will be summarized and discarded. */
	messagesToSummarize: AgentMessage[];
	/** Messages from the prefix of a split turn. */
	turnPrefixMessages: AgentMessage[];
	/** Whether the cut is in the middle of a turn. */
	isSplitTurn: boolean;
	tokensBefore: number;
	/** Summary from the previous compaction, if present. */
	previousSummary?: string;
	/** File operations extracted from the summarized messages. */
	fileOps: FileOperations;
	/** Compaction settings used for preparation. */
	settings: CompactionSettings;
}

export interface BranchSummaryResult {
	summary?: string;
	readFiles?: string[];
	modifiedFiles?: string[];
	aborted?: boolean;
	error?: string;
}

/** Details stored in BranchSummaryEntry.details for file tracking. */
export interface BranchSummaryDetails {
	readFiles: string[];
	modifiedFiles: string[];
}

export interface BranchPreparation {
	/** Messages extracted for summarization, in chronological order. */
	messages: AgentMessage[];
	/** File operations extracted from tool calls. */
	fileOps: FileOperations;
	/** Total estimated tokens in messages. */
	totalTokens: number;
}

export interface CollectEntriesResult {
	/** Entries to summarize, in chronological order. */
	entries: SessionEntry[];
	/** Common ancestor between old and new positions, if any. */
	commonAncestorId: string | null;
}

export interface GenerateBranchSummaryOptions {
	/** Model to use for summarization. */
	model: Model<any>;
	/** API key for the model. */
	apiKey: string;
	/** Request headers for the model. */
	headers?: Record<string, string>;
	/** Provider-scoped environment values for the model. */
	env?: Record<string, string>;
	/** Abort signal for cancellation. */
	signal: AbortSignal;
	/** Optional custom instructions for summarization. */
	customInstructions?: string;
	/** If true, customInstructions replaces the default prompt. */
	replaceInstructions?: boolean;
	/** Tokens reserved for prompt and response. */
	reserveTokens?: number;
	/** Session stream function used without mutating agent state. */
	stream?: StreamFunction;
}
