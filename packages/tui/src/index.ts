// Core TUI interfaces and classes

export { type Expandable, ExpandableText } from "#tui/components/display/expandable-text";
export {
	type DefaultTextStyle,
	Markdown,
	type MarkdownOptions,
	type MarkdownTheme,
} from "#tui/components/display/markdown";
export { Text } from "#tui/components/display/text";
export { TruncatedText } from "#tui/components/display/truncated-text";
export { BorderedLoader } from "#tui/components/feedback/bordered-loader";
export { CancellableLoader } from "#tui/components/feedback/cancellable-loader";
export { CountdownTimer } from "#tui/components/feedback/countdown-timer";
export { DynamicBorder } from "#tui/components/layout/dynamic-border";
export { Loader, type LoaderIndicatorOptions } from "#tui/components/feedback/loader";
export {
	formatStructuredReceiptLines,
	renderStructuredReceipt,
} from "#tui/components/display/structured-receipt";
export { refreshHudUi } from "#tui/components/hud/extension-ui";
export type {
	ActiveHudEntry,
	HudChip,
	HudLineEntry,
	HudSeverity,
	HudSummary,
} from "#tui/components/hud/model";
export {
	applyHudStatusFlags,
	formatHudLine,
	hudChip,
	normalizeHudChip,
	normalizeHudSeverity,
	normalizeHudSummary,
	progressChip,
} from "#tui/components/hud/model";
export { renderHudBar } from "#tui/components/hud/render";
export { Editor, type EditorTheme } from "#tui/components/inputs/editor";
export { Input } from "#tui/components/inputs/input";
// Components
export { Box } from "#tui/components/layout/box";
export { Spacer } from "#tui/components/layout/spacer";
export { LAYOUT_EDGE_X, LAYOUT_SECTION_GAP_Y } from "#tui/components/layout/spacing";
export {
	type SelectItem,
	SelectList,
	type SelectListLayoutOptions,
	type SelectListTheme,
	type SelectListTruncatePrimaryContext,
} from "#tui/components/selection/select-list";
export { type SettingItem, SettingsList, type SettingsListTheme } from "#tui/components/selection/settings-list";
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
	computeUsageStats,
	formatCwdForFooter,
	formatTokens,
	renderSegment,
	SEGMENTS,
	sanitizeStatusText,
} from "#tui/components/status-line/segments";
export { getSeparator } from "#tui/components/status-line/separators";
export {
	StatusLineComponent,
	StatusLineComponent as FooterComponent,
} from "#tui/components/status-line/status-line";
export type {
	PresetDef,
	RenderedSegment,
	SegmentContext,
	SeparatorDef,
	StatusLineComponentOptions,
	StatusLineDataProvider,
	StatusLineHudChip,
	StatusLineHudEntry,
	StatusLineHudEntryReader,
	StatusLineHudEntryReaderOptions,
	StatusLineHudSeverity,
	StatusLinePreset,
	StatusLineSegment,
	StatusLineSegmentId,
	StatusLineSegmentOptions,
	StatusLineSeparatorStyle,
	StatusLineSessionLike,
	StatusLineSettings,
} from "#tui/components/status-line/types";
export {
	type Component,
	Container,
	CURSOR_MARKER,
	type Focusable,
	isFocusable,
	type OverlayAnchor,
	type OverlayHandle,
	type OverlayMargin,
	type OverlayOptions,
	type OverlayUnfocusOptions,
	type SizeValue,
	TUI,
} from "#tui/core/tui";
// Autocomplete support
export {
	type AutocompleteItem,
	type AutocompleteProvider,
	type AutocompleteSuggestions,
	CombinedAutocompleteProvider,
	type SlashCommand,
} from "#tui/editor/completion/autocomplete";
// Fuzzy matching
export { type FuzzyMatch, fuzzyFilter, fuzzyMatch } from "#tui/editor/completion/fuzzy";
// Editor component interface (for custom editors)
export type { EditorComponent } from "#tui/editor/contracts/editor-component";
// Keybindings
export {
	getKeybindings,
	type Keybinding,
	type KeybindingConflict,
	type KeybindingDefinition,
	type KeybindingDefinitions,
	type Keybindings,
	type KeybindingsConfig,
	KeybindingsManager,
	setKeybindings,
	TUI_KEYBINDINGS,
} from "#tui/input/keyboard/keybindings";
export {
	formatKeyText,
	type KeyTextFormatOptions,
	keyDisplayText,
	keyHint,
	keyText,
	rawKeyHint,
} from "#tui/input/keyboard/keybinding-hints";
// Keyboard input handling
export {
	decodeKittyPrintable,
	isKeyRelease,
	isKeyRepeat,
	isKittyProtocolActive,
	Key,
	type KeyEventType,
	type KeyId,
	matchesKey,
	parseKey,
	setKittyProtocolActive,
} from "#tui/input/keyboard/keys";
// Input buffering for batch splitting
export { StdinBuffer, type StdinBufferEventMap, type StdinBufferOptions } from "#tui/input/stream/stdin-buffer";
// Capabilities
export {
	detectCapabilities,
	getCapabilities,
	hyperlink,
	resetCapabilitiesCache,
	setCapabilities,
	type TerminalCapabilities,
} from "#tui/terminal/features/capabilities";
// Terminal colors
export { parseOsc11BackgroundColor, type RgbColor } from "#tui/terminal/features/terminal-colors";
// Terminal interface and implementations
export { ProcessTerminal, type Terminal } from "#tui/terminal/runtime/terminal";
export * from "#tui/theme/theme";
// Utilities
export { stripAnsi } from "#tui/utilities/ansi";
export { type DiffRenderTheme, type RenderDiffOptions, renderDiff } from "#tui/utilities/diff";
export {
	type HighlightOptions,
	type HighlightTheme,
	highlight,
	renderHighlightedHtml,
	supportsLanguage,
} from "#tui/components/display/syntax-highlight";
export { sliceByColumn, truncateToWidth, visibleWidth, wrapTextWithAnsi } from "#tui/utilities/text";
export { truncateToVisualLines, type VisualTruncateResult } from "#tui/components/display/visual-truncate";
