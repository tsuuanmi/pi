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

## Running the Demo

```bash
# TUI chat demo
npx tsx test/chat-simple.ts
```

## Debug Logging

Set `PI_TUI_WRITE_LOG` to capture the raw ANSI stream written to stdout:

```bash
PI_TUI_WRITE_LOG=/tmp/tui-ansi.log npx tsx test/chat-simple.ts
```

## Project Structure

```
packages/tui/
├── docs/                    # Documentation
├── native/                  # Native prebuilt binaries
│   └── darwin/
│       ├── prebuilds/
│       └── src/
├── src/
│   ├── autocomplete.ts      # CombinedAutocompleteProvider, file path completion
│   ├── capabilities.ts      # Terminal capability detection (true color, hyperlinks)
│   ├── components/
│   │   ├── box.ts           # Box container with padding and background
│   │   ├── cancellable-loader.ts # Loader with Escape/AbortSignal support
│   │   ├── editor.ts        # Multi-line editor with autocomplete
│   │   ├── input.ts         # Single-line input
│   │   ├── loader.ts        # Animated loading spinner
│   │   ├── markdown.ts      # Markdown renderer with themes
│   │   ├── select-list.ts   # Interactive selection list
│   │   ├── settings-list.ts # Settings panel with value cycling
│   │   ├── spacer.ts        # Vertical spacing
│   │   ├── text.ts           # Multi-line text with wrapping
│   │   └── truncated-text.ts # Single-line truncated text
│   ├── editor-component.ts  # EditorComponent interface
│   ├── fuzzy.ts             # Fuzzy string matching
│   ├── input/
│   │   ├── keybindings.ts   # Keybinding registry and manager
│   │   ├── keys.ts          # Key detection, Kitty protocol support
│   │   ├── native-modifiers.ts # Native modifier key detection
│   │   └── stdin-buffer.ts  # Input buffering for escape sequences
│   ├── terminal-colors.ts   # OSC 11 background color parsing
│   ├── terminal.ts          # ProcessTerminal, VirtualTerminal
│   ├── tui.ts               # TUI container, Component, Focusable, Overlay
│   ├── undo-stack.ts        # Generic undo stack
│   ├── utils.ts             # visibleWidth, truncateToWidth, wrapTextWithAnsi
│   └── word-navigation.ts   # Word boundary navigation
└── test/                    # Test files
```