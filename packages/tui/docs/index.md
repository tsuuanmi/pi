# @tsuuanmi/pi-tui Documentation

Minimal terminal UI framework with differential rendering and synchronized output for flicker-free interactive CLI applications.

## Start here

- [Core API](core/tui.md) - `TUI`, `Terminal`, `Component`, and `Focusable` interfaces.
- [Terminal Interface](terminal/runtime/terminal.md) - `ProcessTerminal`, `VirtualTerminal`, Kitty protocol negotiation, and bracketed paste.
- [Terminal Capabilities](terminal/features/capabilities.md) - True color detection, OSC 8 hyperlink support, and tmux forwarding.
- [Terminal Colors](terminal/features/terminal-colors.md) - OSC 11 background color parsing and `RgbColor`.
- [Differential Rendering](rendering.md) - Three-strategy rendering system, synchronized output, and update protocols.

## Components

Built-in components live under `src/components/` and mirror that layout in these docs.

- [Components](components/index.md) - Built-in display/feedback/inputs/layout/selection components: `Text`, `TruncatedText`, `Input`, `Editor`, `Markdown`, `Loader`, `CancellableLoader`, `SelectList`, `SettingsList`, `Spacer`, `Box`, `Container`.
- [HUD](components/hud/index.md) - Heads-up display model, rendering, and the `refreshHudUi` redraw hook.
- [Status Line](components/status-line/index.md) - `StatusLineComponent` (HUD line + configurable segment rail + hook status line), segments, presets, separators, context thresholds, and git utils.

## Editor

- [Editor Component Interface](editor/contracts/editor-component.md) - `EditorComponent` contract for custom editors.
- [Autocomplete](editor/completion/autocomplete.md) - `CombinedAutocompleteProvider`, slash commands, file path completion, and custom providers.
- [Fuzzy Matching](editor/completion/fuzzy.md) - `fuzzyMatch`, `fuzzyFilter`, and scoring.
- [Undo Stack](editor/history/undo-stack.md) - Clone-on-push undo stack used by the editor.
- [Word Navigation](editor/navigation/word-navigation.md) - `findWordBackward`/`findWordForward` word motions.

## Input

- [Key Detection](input/keyboard/keys.md) - `matchesKey()`, `Key` helper, Kitty keyboard protocol, and key identifiers.
- [Keybindings](input/keyboard/keybindings.md) - `TUI_KEYBINDINGS`, `KeybindingsManager`, and custom keybinding configuration.
- [Stdin Buffer](input/stream/stdin-buffer.md) - Input buffering and escape-sequence batch splitting.

## Terminal

- [Terminal Runtime](terminal/runtime/terminal.md) - `ProcessTerminal`, `VirtualTerminal`, `Terminal` interface.
- [Capabilities](terminal/features/capabilities.md) - True color, OSC 8 hyperlinks, tmux forwarding.
- [Terminal Colors](terminal/features/terminal-colors.md) - OSC 11 background parsing and `RgbColor`.

## Theme

- [Theme](theme/index.md) - The active `theme` instance, lifecycle (`initTheme`/`setTheme`), `Theme` class color tokens, terminal-background detection, and per-component theme adapters.
- [Theme Schema](theme/theme-schema.md) - JSON schema for theme files, color values, and built-in `dark`/`light` themes.

## Utilities

- [Text](utilities/text.md) - `visibleWidth`, `truncateToWidth`, `wrapTextWithAnsi`, `sliceByColumn`, `sliceWithWidth`, and ANSI-aware utilities.
- [ANSI](utilities/ansi.md) - `stripAnsi` ANSI escape stripping.
- [Diff](utilities/diff.md) - `renderDiff` unified diff rendering with intra-line highlighting.
- [Keybinding Hints](utilities/keybinding-hints.md) - `keyText`, `keyHint`, `rawKeyHint`, `formatKeyText`.
- [Syntax Highlight](utilities/syntax-highlight.md) - `highlight`, `renderHighlightedHtml`, `supportsLanguage` (highlight.js wrapper).
- [Visual Truncation](utilities/visual-truncate.md) - `truncateToVisualLines` end-anchored visual-line truncation.

## Overlays

- [Overlays](overlays.md) - Modal overlays, positioning, anchoring, focus management, and visibility.

## Development

- [Development Guide](development.md) - Local setup, running tests, and debugging.