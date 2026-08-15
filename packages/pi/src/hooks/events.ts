import type { AgentEvent, Model, ThinkingLevel } from "@tsuuanmi/pi-agent";
import type { BranchSummaryEntry, CompactionEntry } from "#pi/session/types";

/** Fired when a session is started, loaded, or reloaded. */
export interface SessionStartEvent {
	type: "session_start";
	reason: "startup" | "reload" | "new" | "resume";
	previousSessionFile?: string;
}

/** Fired after context compaction. */
export interface SessionCompactEvent {
	type: "session_compact";
	compactionEntry: CompactionEntry;
	fromExtension: boolean;
}

/** Fired before an extension runtime is torn down. */
export interface SessionShutdownEvent {
	type: "session_shutdown";
	reason: "quit" | "reload" | "new" | "resume";
	targetSessionFile?: string;
}

/** Fired after navigating in the session tree. */
export interface SessionTreeEvent {
	type: "session_tree";
	newLeafId: string | null;
	oldLeafId: string | null;
	summaryEntry?: BranchSummaryEntry;
	fromExtension?: boolean;
}

export type SessionEvent = SessionStartEvent | SessionCompactEvent | SessionShutdownEvent | SessionTreeEvent;

/** Fired after a provider response is received and before its stream is consumed. */
export interface AfterProviderResponseEvent {
	type: "after_provider_response";
	status: number;
	headers: Record<string, string>;
}

export type ModelSelectSource = "set" | "cycle" | "restore";

/** Fired when a model is selected. */
export interface ModelSelectEvent {
	type: "model_select";
	model: Model<any>;
	previousModel: Model<any> | undefined;
	source: ModelSelectSource;
}

/** Fired when a thinking level is selected. */
export interface ThinkingLevelSelectEvent {
	type: "thinking_level_select";
	level: ThinkingLevel;
	previousLevel: ThinkingLevel;
}

export type HostEvent = SessionEvent | AfterProviderResponseEvent | ModelSelectEvent | ThinkingLevelSelectEvent;

/** Observer-only extension lifecycle. Agent-owned payloads are reused unchanged. */
export type ExtensionEvent = AgentEvent | HostEvent;
