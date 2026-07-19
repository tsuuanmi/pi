// ═══════════════════════════════════════════════════════════════════════════
// Settings Types
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Status line segment identifiers. `thinking` is intentionally not a segment;
 * it is rendered inside `model` via `segmentOptions.model.showThinkingLevel`.
 */
export type StatusLineSegmentId =
	| "model"
	| "mode"
	| "git"
	| "path"
	| "context_pct"
	| "context_total"
	| "token_in"
	| "token_out"
	| "session_name"
	| "subagents";

/** Status line separator visual style. */
export type StatusLineSeparatorStyle = "slash";

/** Status line preset name. */
export type StatusLinePreset = "default" | "custom";

/** Per-segment rendering options for the status line. */
export interface StatusLineSegmentOptions {
	model?: {
		/** Show the thinking level folded into the model segment (default: true). */
		showThinkingLevel?: boolean;
		/** Prepend `(provider)` when more than one provider is available (default: true). */
		showProviderPrefix?: boolean;
	};
	path?: {
		/** Abbreviate the displayed path (default: true). */
		abbreviate?: boolean;
		/** Maximum length before truncation, in characters (default: 40). */
		maxLength?: number;
		/** Strip a configured work-tree prefix (no-op in Pi; gajae-only; default: false). */
		stripWorkPrefix?: boolean;
	};
	git?: {
		/** Show the branch name (default: true). */
		showBranch?: boolean;
		/** Show the staged file count (default: true). */
		showStaged?: boolean;
		/** Show the unstaged file count (default: true). */
		showUnstaged?: boolean;
		/** Show the untracked file count (default: true). */
		showUntracked?: boolean;
	};
}

/** Status line settings. */
export interface StatusLineSettings {
	/** Preset name (default: "default"). */
	preset?: StatusLinePreset;
	/** Left-group segment ids, rendered left-to-right. */
	leftSegments?: StatusLineSegmentId[];
	/** Right-group segment ids, rendered right-aligned. */
	rightSegments?: StatusLineSegmentId[];
	/** Separator style between segments (default: "slash"). */
	separator?: StatusLineSeparatorStyle;
	/** Per-segment options. */
	segmentOptions?: StatusLineSegmentOptions;
	/** Render the HUD line above the status rail when workflows are active (default: true). */
	showHud?: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
// Structural Host Interfaces
// ═══════════════════════════════════════════════════════════════════════════

export interface StatusLineModelState {
	id?: string;
	name?: string;
	provider?: string;
	contextWindow?: number;
	reasoning?: boolean;
}

export interface StatusLineSessionEntry {
	type: string;
	message?: {
		role?: string;
		usage?: {
			input?: number;
			output?: number;
		};
	};
}

export interface StatusLineSessionLike {
	state: {
		model?: StatusLineModelState | null;
		thinkingLevel?: string | null;
	};
	sessionId?: string;
	sessionManager: {
		getEntries(): readonly StatusLineSessionEntry[];
		getSessionName(): string | undefined;
		getCwd(): string;
	};
	getContextUsage(): { contextWindow?: number; percent?: number | null } | null | undefined;
	subagentManager?: { getActiveCount(): number };
}

export interface StatusLineDataProvider {
	getGitBranch(): string | null;
	getExtensionStatuses(): ReadonlyMap<string, string>;
	getAvailableProviderCount(): number;
}

export interface StatusLineWorkflowEntry {
	skill: string;
	active: boolean;
	phase?: string;
	updated_at?: string;
	hud?: {
		summary?: string;
		chips?: StatusLineWorkflowHudChip[];
	};
	stale?: boolean;
}

export type StatusLineWorkflowHudSeverity = "info" | "warning" | "blocked" | "error" | "success";

export interface StatusLineWorkflowHudChip {
	label: string;
	value?: string;
	priority?: number;
	severity?: StatusLineWorkflowHudSeverity;
}

export interface StatusLineWorkflowStateReaderOptions {
	cwd: string;
	sessionId: string;
}

export type StatusLineWorkflowStateReader = (
	options: StatusLineWorkflowStateReaderOptions,
) => Promise<readonly StatusLineWorkflowEntry[] | undefined>;

export interface StatusLineComponentOptions {
	readWorkflowEntries?: StatusLineWorkflowStateReader;
}

// ═══════════════════════════════════════════════════════════════════════════
// Segment Rendering
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Context passed to each segment renderer. Computed once per render by the
 * component and shared across all segments. Contains everything a segment
 * needs without reaching into session internals ad hoc.
 */
export interface SegmentContext {
	session: StatusLineSessionLike;
	/** Total render width available to the rail (terminal columns). */
	width: number;
	options: StatusLineSegmentOptions;
	/** Cumulative usage across all session entries. */
	usageStats: {
		input: number;
		output: number;
	};
	/** Context usage percent (0-100), or null when unknown (e.g. after compaction). */
	contextPercent: number | null;
	/** Context window in tokens (0 when unknown). */
	contextWindow: number;
	/** Whether auto-compaction is enabled (drives the `(auto)` indicator). */
	autoCompactEnabled: boolean;
	/** Count of live (running + paused) subagents. */
	subagentCount: number;
	/** Number of providers with available models (drives the `(provider)` prefix). */
	availableProviderCount: number;
	/** Git state from the shared provider + porcelain cache. */
	git: {
		branch: string | null;
		status: { staged: number; unstaged: number; untracked: number } | null;
	};
	/** Active workflow phase (e.g. "planner"), undefined when no workflow active. */
	workflowPhase?: string;
}

export interface RenderedSegment {
	/** The segment text (may include ANSI color codes). Empty when not visible. */
	content: string;
	/** Whether to render (e.g. git hidden when not in a repo). */
	visible: boolean;
}

export interface StatusLineSegment {
	id: StatusLineSegmentId;
	render(ctx: SegmentContext): RenderedSegment;
}

// ═══════════════════════════════════════════════════════════════════════════
// Separator + Preset Definitions
// ═══════════════════════════════════════════════════════════════════════════

export interface SeparatorDef {
	/** Separator glyph rendered between segments in the left group. */
	left: string;
	/** Separator glyph rendered between segments in the right group. */
	right: string;
}

export interface PresetDef {
	leftSegments: StatusLineSegmentId[];
	rightSegments: StatusLineSegmentId[];
	separator: StatusLineSeparatorStyle;
	segmentOptions?: StatusLineSegmentOptions;
}
