// Public surface of the status line module.

export { renderHudBar } from "#tui/components/hud/render";
export {
	type ContextUsageLevel,
	getContextUsageLevel,
	getContextUsageThemeColor,
} from "#tui/components/status-line/context-thresholds";
export {
	type GitStatusSummary,
	parseStatusPorcelain,
	runGitStatusPorcelain,
} from "#tui/components/status-line/git-utils";
export { getPreset, STATUS_LINE_PRESETS } from "#tui/components/status-line/presets";
export {
	ALL_SEGMENT_IDS,
	renderSegment,
	SEGMENTS,
} from "#tui/components/status-line/segments";
export { getSeparator } from "#tui/components/status-line/separators";
export { StatusLineComponent } from "#tui/components/status-line/status-line";
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
} from "#tui/components/status-line/types";
