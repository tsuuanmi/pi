# UI Rendering

The TUI rendering pipeline for the interactive mode.

## Overview

The rendering pipeline converts component output into terminal escape sequences, applying differential rendering and synchronized output for flicker-free updates.

## Key Concepts

- **Differential rendering** — Only changed lines are re-rendered
- **Synchronized output** — Terminal updates are batched and flushed together
- **Cursor positioning** — Hardware cursor is positioned via APC markers

## See Also

- [TUI Components](../../ui/tui.md) - Component API