// Core TUI interfaces and classes

// Components
export { Box } from "#tui/components/box";
export { CancellableLoader } from "#tui/components/cancellable-loader";
export { Editor, type EditorTheme } from "#tui/components/editor";
export { Input } from "#tui/components/input";
export { Loader, type LoaderIndicatorOptions } from "#tui/components/loader";
export { type DefaultTextStyle, Markdown, type MarkdownOptions, type MarkdownTheme } from "#tui/components/markdown";
export {
	type SelectItem,
	SelectList,
	type SelectListLayoutOptions,
	type SelectListTheme,
	type SelectListTruncatePrimaryContext,
} from "#tui/components/select-list";
export { type SettingItem, SettingsList, type SettingsListTheme } from "#tui/components/settings-list";
export { Spacer } from "#tui/components/spacer";
export { Text } from "#tui/components/text";
export { TruncatedText } from "#tui/components/truncated-text";
// Autocomplete support
export {
	type AutocompleteItem,
	type AutocompleteProvider,
	type AutocompleteSuggestions,
	CombinedAutocompleteProvider,
	type SlashCommand,
} from "#tui/editor/autocomplete";
// Editor component interface (for custom editors)
export type { EditorComponent } from "#tui/editor/editor-component";
// Fuzzy matching
export { type FuzzyMatch, fuzzyFilter, fuzzyMatch } from "#tui/editor/fuzzy";
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
} from "#tui/input/keybindings";
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
} from "#tui/input/keys";
// Input buffering for batch splitting
export { StdinBuffer, type StdinBufferEventMap, type StdinBufferOptions } from "#tui/input/stdin-buffer";
// Capabilities
export {
	detectCapabilities,
	getCapabilities,
	hyperlink,
	resetCapabilitiesCache,
	setCapabilities,
	type TerminalCapabilities,
} from "#tui/terminal/capabilities";
// Terminal interface and implementations
export { ProcessTerminal, type Terminal } from "#tui/terminal/terminal";
// Terminal colors
export { parseOsc11BackgroundColor, type RgbColor } from "#tui/terminal/terminal-colors";
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
} from "#tui/tui";
// Utilities
export { sliceByColumn, truncateToWidth, visibleWidth, wrapTextWithAnsi } from "#tui/utils";
