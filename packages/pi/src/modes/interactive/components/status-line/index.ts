// Public surface of the status line module.

export { renderSkillHudBar } from "#pi/modes/interactive/components/skill-hud/render";
export {
	type ContextUsageLevel,
	getContextUsageLevel,
	getContextUsageThemeColor,
} from "#pi/modes/interactive/components/status-line/context-thresholds";
export {
	type GitStatusSummary,
	parseStatusPorcelain,
	runGitStatusPorcelain,
} from "#pi/modes/interactive/components/status-line/git-utils";
export { getPreset, STATUS_LINE_PRESETS } from "#pi/modes/interactive/components/status-line/presets";
export {
	ALL_SEGMENT_IDS,
	renderSegment,
	SEGMENTS,
} from "#pi/modes/interactive/components/status-line/segments";
export { getSeparator } from "#pi/modes/interactive/components/status-line/separators";
export { StatusLineComponent } from "#pi/modes/interactive/components/status-line/status-line";
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
} from "#pi/modes/interactive/components/status-line/types";
