# @tsuuanmi/pi-tui Documentation

Minimal terminal UI framework with differential rendering and synchronized output for flicker-free interactive CLI applications.

## Start here

- [Core API](core-api.md) - `TUI`, `Terminal`, `Component`, and `Focusable` interfaces.
- [Terminal Interface](terminal.md) - `ProcessTerminal`, `VirtualTerminal`, Kitty protocol negotiation, and bracketed paste.
- [Terminal Capabilities](capabilities.md) - True color detection, OSC 8 hyperlink support, and tmux forwarding.
- [Differential Rendering](rendering.md) - Three-strategy rendering system, synchronized output, and update protocols.
- [Autocomplete](autocomplete.md) - `CombinedAutocompleteProvider`, slash commands, file path completion, and custom providers.
- [Utilities](utilities.md) - `visibleWidth`, `truncateToWidth`, `wrapTextWithAnsi`, `sliceByColumn`, `sliceWithWidth`, and ANSI-aware utilities.
- [Custom Components](custom-components.md) - Building components, handling input, line width constraints, caching, and IME support.

## Components

- [Components](components/index.md) - Built-in components: `Text`, `TruncatedText`, `Input`, `Editor`, `Markdown`, `Loader`, `CancellableLoader`, `SelectList`, `SettingsList`, `Spacer`, `Box`, `Container`.

## Input

- [Key Detection](input/keys.md) - `matchesKey()`, `Key` helper, Kitty keyboard protocol, and key identifiers.
- [Keybindings](input/keybindings.md) - `TUI_KEYBINDINGS`, `KeybindingsManager`, and custom keybinding configuration.

## Overlays

- [Overlays](overlays.md) - Modal overlays, positioning, anchoring, focus management, and visibility.

## Development

- [Development Guide](development.md) - Local setup, running tests, and debugging.