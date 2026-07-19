// Public surface of the status line module.

export { renderSkillHudBar } from "#coding-agent/modes/interactive/components/skill-hud/render";
export {
	type ContextUsageLevel,
	getContextUsageLevel,
	getContextUsageThemeColor,
} from "#coding-agent/modes/interactive/components/status-line/context-thresholds";
export {
	type GitStatusSummary,
	parseStatusPorcelain,
	runGitStatusPorcelain,
} from "#coding-agent/modes/interactive/components/status-line/git-utils";
export { getPreset, STATUS_LINE_PRESETS } from "#coding-agent/modes/interactive/components/status-line/presets";
export {
	ALL_SEGMENT_IDS,
	renderSegment,
	SEGMENTS,
} from "#coding-agent/modes/interactive/components/status-line/segments";
export { getSeparator } from "#coding-agent/modes/interactive/components/status-line/separators";
export { StatusLineComponent } from "#coding-agent/modes/interactive/components/status-line/status-line";
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
} from "#coding-agent/modes/interactive/components/status-line/types";
