// Core TUI interfaces and classes

export {
	type DefaultTextStyle,
	Markdown,
	type MarkdownOptions,
	type MarkdownTheme,
} from "#tui/components/display/markdown";
export { Text } from "#tui/components/display/text";
export { TruncatedText } from "#tui/components/display/truncated-text";
export { CancellableLoader } from "#tui/components/feedback/cancellable-loader";
export { Loader, type LoaderIndicatorOptions } from "#tui/components/feedback/loader";
export { Editor, type EditorTheme } from "#tui/components/inputs/editor";
export { Input } from "#tui/components/inputs/input";
// Components
export { Box } from "#tui/components/layout/box";
export { Spacer } from "#tui/components/layout/spacer";
export {
	type SelectItem,
	SelectList,
	type SelectListLayoutOptions,
	type SelectListTheme,
	type SelectListTruncatePrimaryContext,
} from "#tui/components/selection/select-list";
export { type SettingItem, SettingsList, type SettingsListTheme } from "#tui/components/selection/settings-list";
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
	formatKeyText,
	type KeyTextFormatOptions,
	keyDisplayText,
	keyHint,
	keyText,
	rawKeyHint,
} from "#tui/utilities/keybinding-hints";
export {
	type HighlightOptions,
	type HighlightTheme,
	highlight,
	renderHighlightedHtml,
	supportsLanguage,
} from "#tui/utilities/syntax-highlight";
export { sliceByColumn, truncateToWidth, visibleWidth, wrapTextWithAnsi } from "#tui/utilities/text";
export { truncateToVisualLines, type VisualTruncateResult } from "#tui/utilities/visual-truncate";
