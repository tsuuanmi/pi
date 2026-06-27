# Core API

The TUI framework is built around three core concepts: the `TUI` container, the `Terminal` interface, and the `Component` interface.

## TUI

`TUI` is the main container that manages components, focus, overlays, and rendering.

### Creating a TUI

```typescript
import { TUI, ProcessTerminal } from "@tsuuanmi/pi-tui";

const terminal = new ProcessTerminal();
const tui = new TUI(terminal);
```

### Lifecycle

```typescript
// Start rendering and input handling
tui.start();

// Stop rendering and restore terminal state
tui.stop();

// Request a re-render after state changes
tui.requestRender();
```

### Adding and Removing Components

```typescript
tui.addChild(new Text("Welcome!"));
tui.removeChild(someComponent);
```

### Focus Management

```typescript
// Set focus to a component
tui.setFocus(editor);

// Remove focus from all components
tui.setFocus(null);

// Get current focused component
const focused = tui.getFocus();
```

### Global Input Listeners

```typescript
import { matchesKey, Key } from "@tsuuanmi/pi-tui";

tui.addInputListener((data) => {
  if (matchesKey(data, Key.ctrl("c"))) {
    tui.stop();
    process.exit(0);
  }
  // Return { consume: true } to prevent further handling
  // Return undefined or { consume: false } to allow propagation
  return undefined;
});
```

### Debug Mode

```typescript
tui.onDebug = () => {
  console.log("Debug triggered (Shift+Ctrl+D)");
};
```

### Hardware Cursor

By default, the real terminal cursor is hidden and replaced by a fake cursor rendered by focused components. To show the hardware cursor (needed for IME on some terminals):

```typescript
tui.setShowHardwareCursor(true);
// Or via environment variable: PI_HARDWARE_CURSOR=1
```

### Component Interface

All components implement:

```typescript
interface Component {
  /** Render the component to lines for the given viewport width */
  render(width: number): string[];

  /** Optional handler for keyboard input when component has focus */
  handleInput?(data: string): void;

  /** Whether component receives key release events (Kitty protocol). Default: false */
  wantsKeyRelease?: boolean;

  /** Invalidate any cached rendering state */
  invalidate(): void;
}
```

**Critical constraint**: Each line returned by `render()` must not exceed the `width` parameter. The TUI will error if any line is wider than the terminal.

### Focusable Interface

Components that display a text cursor and need IME support should implement `Focusable`:

```typescript
import { CURSOR_MARKER, type Focusable } from "@tsuuanmi/pi-tui";

class MyInput implements Component, Focusable {
  focused: boolean = false; // Set by TUI when focus changes

  render(width: number): string[] {
    const marker = this.focused ? CURSOR_MARKER : "";
    return [`> ${beforeCursor}${marker}\x1b[7m${atCursor}\x1b[27m${afterCursor}`];
  }
}
```

When a `Focusable` component has focus, TUI:

1. Sets `focused = true` on the component
2. Scans rendered output for `CURSOR_MARKER` (a zero-width APC escape sequence)
3. Positions the hardware terminal cursor at that location
4. Shows the hardware cursor only when `showHardwareCursor` is enabled

### Container Components with Embedded Inputs

When a container component contains an `Input` or `Editor` child, the container must implement `Focusable` and propagate focus to the child:

```typescript
import { Container, type Focusable, Input } from "@tsuuanmi/pi-tui";

class SearchDialog extends Container implements Focusable {
  private searchInput: Input;
  private _focused = false;

  get focused(): boolean { return this._focused; }
  set focused(value: boolean) {
    this._focused = value;
    this.searchInput.focused = value;
  }

  constructor() {
    super();
    this.searchInput = new Input();
    this.addChild(this.searchInput);
  }
}
```

Without this propagation, IME candidate windows will appear at the wrong position.

## Terminal Interface

The `Terminal` interface abstracts terminal I/O for testability:

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

Built-in implementations:

| Class | Description |
|-------|-------------|
| `ProcessTerminal` | Uses `process.stdin/stdout` for real terminal I/O |
| `VirtualTerminal` | Uses `@xterm/headless` for testing |

## Event Handling Order

When a key event occurs:

1. Global input listeners run first (added with `addInputListener`)
2. If a listener returns `{ consume: true }`, the event is consumed
3. Otherwise, the focused component's `handleInput()` is called
4. If no component is focused, the event is dropped

Input listeners are called in registration order. The first listener to return `{ consume: true }` stops propagation.