# @tsuuanmi/pi-tui Documentation

Minimal terminal UI framework with differential rendering and synchronized output for flicker-free interactive CLI applications.

## Start here

- [Core API](core/tui.md) - `TUI`, `Terminal`, `Component`, and `Focusable` interfaces.
- [Terminal Interface](terminal/runtime/terminal.md) - `ProcessTerminal`, `VirtualTerminal`, Kitty protocol negotiation, and bracketed paste.
- [Terminal Capabilities](terminal/features/capabilities.md) - True color detection, OSC 8 hyperlink support, and tmux forwarding.
- [Differential Rendering](rendering.md) - Three-strategy rendering system, synchronized output, and update protocols.
- [Autocomplete](editor/completion/autocomplete.md) - `CombinedAutocompleteProvider`, slash commands, file path completion, and custom providers.
- [Utilities](utilities/text.md) - `visibleWidth`, `truncateToWidth`, `wrapTextWithAnsi`, `sliceByColumn`, `sliceWithWidth`, and ANSI-aware utilities.
- [Custom Components](custom-components.md) - Building components, handling input, line width constraints, caching, and IME support.

## Components

- [Components](components/index.md) - Built-in components: `Text`, `TruncatedText`, `Input`, `Editor`, `Markdown`, `Loader`, `CancellableLoader`, `SelectList`, `SettingsList`, `Spacer`, `Box`, `Container`.

## Input

- [Key Detection](input/keyboard/keys.md) - `matchesKey()`, `Key` helper, Kitty keyboard protocol, and key identifiers.
- [Keybindings](input/keyboard/keybindings.md) - `TUI_KEYBINDINGS`, `KeybindingsManager`, and custom keybinding configuration.

## Overlays

- [Overlays](overlays.md) - Modal overlays, positioning, anchoring, focus management, and visibility.

## Development

- [Development Guide](development.md) - Local setup, running tests, and debugging.