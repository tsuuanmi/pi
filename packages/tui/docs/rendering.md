# Differential Rendering

The TUI uses a three-strategy rendering system for efficient, flicker-free updates.

## Rendering Strategies

### Strategy 1: First Render

On the first render, all lines are output without clearing scrollback. This avoids a visible flash on startup.

### Strategy 2: Width Changed or Change Above Viewport

When the terminal width changes or a change occurs above the current viewport (scrolled content), the entire screen is cleared and a full re-render is performed.

### Strategy 3: Normal Update

For typical state changes, only the changed lines are updated:

1. Move cursor to the first changed line
2. Clear from cursor to end of screen
3. Render only the changed lines (and any lines below them that shifted)

## Synchronized Output

All updates are wrapped in synchronized output markers (`\x1b[?2026h` ... `\x1b[?2026l`) for atomic, flicker-free rendering. This is the CSI 2026 protocol supported by most modern terminals.

The rendering sequence for a normal update:

```
\x1b[?2026h          // Begin synchronized update
\x1b[{row};{col}H    // Move cursor to first changed line
\x1b[0J              // Clear from cursor to end of screen
{changed lines}       // Render only changed content
\x1b[?2026l          // End synchronized update
```

## Line Width Constraint

Every line returned by `Component.render(width)` must not exceed the `width` parameter. The TUI will error if any rendered line is wider than the terminal.

Utilities to enforce this constraint:

```typescript
import { truncateToWidth, visibleWidth, wrapTextWithAnsi } from "@tsuuanmi/pi-tui";

// Truncate a line that's too wide
const line = truncateToWidth(longText, maxWidth);

// Check visible width (ignoring ANSI codes)
const width = visibleWidth("\x1b[31mHello\x1b[0m"); // 5

// Wrap text to width (preserving ANSI codes across line breaks)
const lines = wrapTextWithAnsi(longText, maxWidth);
```

## SGR Reset

The TUI appends a full SGR reset (`\x1b[0m`) and OSC 8 reset at the end of each rendered line. Styles do not carry across lines. If you emit multi-line text with styling, reapply styles per line or use `wrapTextWithAnsi()` so styles are preserved for each wrapped line.

## Requesting Re-renders

```typescript
tui.requestRender(); // Schedule a re-render on the next frame
```

Multiple `requestRender()` calls within the same event loop tick are coalesced into a single render pass.

## Rendering and Input

The rendering loop and input handling are decoupled:

- Input events are processed immediately
- Rendering occurs on the next animation frame after `requestRender()` is called
- During rendering, the terminal is in raw mode with echo disabled
- After `tui.stop()`, the terminal is restored to its original state