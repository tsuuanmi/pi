# Terminal Interface

The `Terminal` interface abstracts terminal I/O, enabling both real terminal access and testing with virtual terminals.

## ProcessTerminal

`ProcessTerminal` uses `process.stdin` and `process.stdout` for real terminal I/O:

```typescript
import { ProcessTerminal } from "@tsuuanmi/pi-tui";

const terminal = new ProcessTerminal();
```

### Kitty Protocol Negotiation

On startup, `ProcessTerminal` sends a Kitty keyboard protocol query (`ESC[>7uESC[?uESC[c`) and processes the response to determine protocol support. If the terminal responds with the expected flags, Kitty protocol is activated.

### Bracketed Paste Mode

`ProcessTerminal` enables bracketed paste mode on startup and disables it on shutdown. Large pastes (>10 lines) are handled with markers.

### Input Draining

Before exit, `ProcessTerminal.drainInput()` clears pending input to prevent Kitty key release events from leaking to the parent shell over slow SSH connections:

```typescript
await terminal.drainInput(1000, 50); // maxMs, idleMs
```

### Terminal Progress

`ProcessTerminal` sets terminal progress indicators:

| State | Sequence | Description |
|-------|----------|-------------|
| Active | `ESC]9;4;3BEL` | Shows progress indicator |
| Clear | `ESC]9;4;0;BEL` | Clears progress indicator |

Progress is automatically shown during rendering and cleared on stop.

## VirtualTerminal

`VirtualTerminal` uses `@xterm/headless` for testing without a real terminal:

```typescript
import { VirtualTerminal } from "@tsuuanmi/pi-tui";

const terminal = new VirtualTerminal(80, 24); // columns, rows
```

Useful for unit tests and snapshot testing of TUI output.

## Terminal Interface

```typescript
interface Terminal {
  start(onInput: (data: string) => void, onResize: () => void): void;
  stop(): void;
  write(data: string): void;
  get columns(): number;
  get rows(): number;
  moveBy(lines: number): void;
  hideCursor(): void;
  showCursor(): void;
  clearLine(): void;
  clearFromCursor(): void;
  clearScreen(): void;
  drainInput?(maxMs?: number, idleMs?: number): Promise<void>;
}
```

| Method | Description |
|--------|-------------|
| `start(onInput, onResize)` | Begin terminal I/O with input and resize handlers |
| `stop()` | Restore terminal state and stop I/O |
| `write(data)` | Write raw data to the terminal |
| `columns` | Current terminal width |
| `rows` | Current terminal height |
| `moveBy(lines)` | Move cursor by N lines (negative = up) |
| `hideCursor()` | Hide the terminal cursor |
| `showCursor()` | Show the terminal cursor |
| `clearLine()` | Clear the current line |
| `clearFromCursor()` | Clear from cursor to end of screen |
| `clearScreen()` | Clear the entire screen |
| `drainInput(maxMs?, idleMs?)` | Drain pending input before exit |

## Terminal Capabilities

The `ProcessTerminal` automatically detects:

- **True color support**: Via `COLORTERM=truecolor` or `COLORTERM=24bit`
- **OSC 8 hyperlinks**: Via terminal identification (`KITTY_WINDOW_ID`, `WEZTERM_PANE`, `ITERM_SESSION_ID`, etc.)
- **Kitty keyboard protocol**: Via protocol negotiation query
- **tmux**: Via `TMUX` environment variable, with hyperlink forwarding detection

See [Terminal Capabilities](../features/capabilities.md) for details.