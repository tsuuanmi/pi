// Public surface of the status line module.

export { renderSkillHudBar } from "../skill-hud/render.ts";
export { type ContextUsageLevel, getContextUsageLevel, getContextUsageThemeColor } from "./context-thresholds.ts";
export { type GitStatusSummary, parseStatusPorcelain, runGitStatusPorcelain } from "./git-utils.ts";
export { getPreset, STATUS_LINE_PRESETS } from "./presets.ts";
export { ALL_SEGMENT_IDS, renderSegment, SEGMENTS } from "./segments.ts";
export { getSeparator } from "./separators.ts";
export { StatusLineComponent } from "./status-line.ts";
export type {
	PresetDef,
	RenderedSegment,
	SegmentContext,
	SeparatorDef,
	StatusLinePreset,
	StatusLineSegment,
	StatusLineSegmentId,
	StatusLineSegmentOptions,
	StatusLineSeparatorStyle,
	StatusLineSettings,
} from "./types.ts";
