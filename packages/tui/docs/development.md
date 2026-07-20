# Development Guide

## Setup

```bash
# From the monorepo root
npm install

# Run type checking
npm run check
```

## Running Tests

```bash
# From the package directory
npx vitest --run
```

## Project Structure

```
packages/tui/
├── docs/                    # Documentation
├── src/
│   ├── core/
│   │   └── tui.ts           # TUI container, Component, Focusable, Overlay
│   ├── utilities/
│   │   ├── ansi.ts           # stripAnsi
│   │   ├── diff.ts            # renderDiff (unified diff with intra-line highlighting)
│   │   ├── keybinding-hints.ts  # keyText, keyHint, formatKeyText
│   │   ├── syntax-highlight.ts  # highlight.js wrapper
│   │   ├── text.ts           # visibleWidth, truncateToWidth, wrapTextWithAnsi
│   │   └── visual-truncate.ts  # truncateToVisualLines
│   ├── components/
│   │   ├── display/         # Markdown, Text, TruncatedText
│   │   ├── feedback/        # Loader, CancellableLoader
│   │   ├── inputs/          # Input, Editor
│   │   ├── layout/          # Box, Spacer
│   │   ├── selection/       # SelectList, SettingsList
│   │   ├── hud/             # HUD model, rendering, extension UI hook
│   │   └── status-line/     # StatusLineComponent, segments, presets, git utils
│   ├── editor/
│   │   ├── completion/      # Autocomplete providers and fuzzy matching
│   │   ├── contracts/       # EditorComponent interface
│   │   ├── history/         # UndoStack
│   │   └── navigation/      # Word boundary navigation
│   ├── input/
│   │   ├── keyboard/        # Keybindings and key detection
│   │   └── stream/          # Input buffering for escape sequences
│   ├── terminal/
│   │   ├── features/        # Capabilities and OSC 11 color parsing
│   │   └── runtime/         # ProcessTerminal, Terminal interface
│   └── theme/
│       ├── theme.ts          # Theme instance, loading, detection, adapters
│       ├── theme-schema.json  # JSON schema for theme files
│       ├── dark.json         # Built-in dark theme
│       └── light.json        # Built-in light theme
└── test/                    # Test files matching the src/ layout
```
