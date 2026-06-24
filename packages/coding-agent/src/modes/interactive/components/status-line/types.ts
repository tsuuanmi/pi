import type { AgentSession } from "../../../../core/agent-session/agent-session.ts";
import type {
	StatusLinePreset,
	StatusLineSegmentId,
	StatusLineSegmentOptions,
	StatusLineSeparatorStyle,
	StatusLineSettings,
} from "../../../../core/settings/settings-manager.ts";

// Re-export the structural settings types (defined in core to avoid a
// core -> modes cycle). Consumers import status-line types from here.
export type {
	StatusLinePreset,
	StatusLineSegmentId,
	StatusLineSegmentOptions,
	StatusLineSeparatorStyle,
	StatusLineSettings,
};

// ═══════════════════════════════════════════════════════════════════════════
// Segment Rendering
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Context passed to each segment renderer. Computed once per render by the
 * component and shared across all segments. Contains everything a segment
 * needs without reaching into session internals ad hoc.
 */
export interface SegmentContext {
	session: AgentSession;
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
