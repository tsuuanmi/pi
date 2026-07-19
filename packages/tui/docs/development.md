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
│   │   └── text.ts          # visibleWidth, truncateToWidth, wrapTextWithAnsi
│   ├── components/
│   │   ├── display/         # Markdown, Text, TruncatedText
│   │   ├── feedback/        # Loader, CancellableLoader
│   │   ├── inputs/          # Input, Editor
│   │   ├── layout/          # Box, Spacer
│   │   └── selection/       # SelectList, SettingsList
│   ├── editor/
│   │   ├── completion/      # Autocomplete providers and fuzzy matching
│   │   ├── contracts/       # EditorComponent interface
│   │   ├── history/         # UndoStack
│   │   └── navigation/      # Word boundary navigation
│   ├── input/
│   │   ├── keyboard/        # Keybindings and key detection
│   │   └── stream/          # Input buffering for escape sequences
│   └── terminal/
│       ├── features/        # Capabilities and OSC 11 color parsing
│       └── runtime/         # ProcessTerminal, Terminal interface
└── test/                    # Test files matching the src/ layout
```
