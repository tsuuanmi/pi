# Custom Components

Building custom components that integrate with the TUI framework.

## Component Interface

All components must implement:

```typescript
interface Component {
  render(width: number): string[];
  handleInput?(data: string): void;
  wantsKeyRelease?: boolean;
  invalidate(): void;
}
```

| Method/Property | Required | Description |
|-----------------|----------|-------------|
| `render(width)` | Yes | Returns array of strings, one per line. Each line must not exceed `width`. |
| `handleInput(data)` | No | Called when component has focus and receives keyboard input |
| `wantsKeyRelease` | No | Set `true` to receive key release events (Kitty protocol). Default `false`. |
| `invalidate()` | Yes | Clear cached render state so next `render()` re-renders from scratch |

## Basic Component

```typescript
import { type Component, truncateToWidth } from "@tsuuanmi/pi-tui";

class HelloWorld implements Component {
  private message: string;

  constructor(message: string) {
    this.message = message;
  }

  setMessage(message: string): void {
    this.message = message;
  }

  invalidate(): void {
    // No cache to invalidate in this simple component
  }

  render(width: number): string[] {
    return [truncateToWidth(this.message, width)];
  }
}
```

## Interactive Component with Input

```typescript
import { matchesKey, Key, truncateToWidth, type Component } from "@tsuuanmi/pi-tui";

class MenuComponent implements Component {
  private selectedIndex = 0;
  private items = ["Option 1", "Option 2", "Option 3"];

  public onSelect?: (index: number) => void;
  public onCancel?: () => void;

  handleInput(data: string): void {
    if (matchesKey(data, Key.up)) {
      this.selectedIndex = Math.max(0, this.selectedIndex - 1);
    } else if (matchesKey(data, Key.down)) {
      this.selectedIndex = Math.min(this.items.length - 1, this.selectedIndex + 1);
    } else if (matchesKey(data, Key.enter)) {
      this.onSelect?.(this.selectedIndex);
    } else if (matchesKey(data, Key.escape) || matchesKey(data, Key.ctrl("c"))) {
      this.onCancel?.();
    }
  }

  invalidate(): void {}

  render(width: number): string[] {
    return this.items.map((item, i) => {
      const prefix = i === this.selectedIndex ? "> " : "  ";
      return truncateToWidth(prefix + item, width);
    });
  }
}
```

## Focusable Component (IME Support)

Components that display a cursor and need IME support should implement `Focusable`:

```typescript
import { CURSOR_MARKER, type Component, type Focusable, truncateToWidth } from "@tsuuanmi/pi-tui";

class TextInput implements Component, Focusable {
  focused: boolean = false;
  private text = "";
  private cursorPos = 0;

  handleInput(data: string): void {
    // Handle key input
  }

  invalidate(): void {}

  render(width: number): string[] {
    const beforeCursor = this.text.slice(0, this.cursorPos);
    const atCursor = this.text.slice(this.cursorPos, this.cursorPos + 1);
    const afterCursor = this.text.slice(this.cursorPos + 1);
    const marker = this.focused ? CURSOR_MARKER : "";

    return [
      truncateToWidth(`> ${beforeCursor}${marker}\x1b[7m${atCursor}\x1b[27m${afterCursor}`, width),
    ];
  }
}
```

The `CURSOR_MARKER` is a zero-width APC escape sequence that the TUI scans for in the rendered output. When found, it positions the hardware terminal cursor at that location.

## Caching

For performance, components should cache their rendered output and only re-render when necessary:

```typescript
class CachedComponent implements Component {
  private text: string;
  private cachedWidth?: number;
  private cachedLines?: string[];

  render(width: number): string[] {
    if (this.cachedLines && this.cachedWidth === width) {
      return this.cachedLines;
    }

    const lines = [truncateToWidth(this.text, width)];
    this.cachedWidth = width;
    this.cachedLines = lines;
    return lines;
  }

  invalidate(): void {
    this.cachedWidth = undefined;
    this.cachedLines = undefined;
  }
}
```

## Container Components with Children

Use `Container` to group multiple components:

```typescript
import { Container, Text, type Component } from "@tsuuanmi/pi-tui";

class Dialog implements Component {
  private container = new Container();
  private title: Text;
  private body: Text;

  constructor(title: string, body: string) {
    this.title = new Text(title);
    this.body = new Text(body);
    this.container.addChild(this.title);
    this.container.addChild(this.body);
  }

  invalidate(): void {
    this.title.invalidate();
    this.body.invalidate();
    this.container.invalidate();
  }

  render(width: number): string[] {
    return this.container.render(width);
  }
}
```

## EditorComponent Interface

For custom editor implementations (e.g., vim mode, emacs mode), implement `EditorComponent`:

```typescript
import { type EditorComponent, type AutocompleteProvider } from "@tsuuanmi/pi-tui";

class VimEditor implements EditorComponent {
  // Core text access (required)
  getText(): string { return this.text; }
  setText(text: string): void { this.text = text; }
  handleInput(data: string): void { /* vim keybindings */ }

  // Callbacks (required)
  onSubmit?: (text: string) => void;
  onChange?: (text: string) => void;

  // History support (optional)
  addToHistory?(text: string): void;

  // Advanced text manipulation (optional)
  insertTextAtCursor?(text: string): void;
  getExpandedText?(): string;

  // Autocomplete support (optional)
  setAutocompleteProvider?(provider: AutocompleteProvider): void;

  // Appearance (optional)
  borderColor?: (str: string) => string;
  setPaddingX?(padding: number): void;
  setAutocompleteMaxVisible?(maxVisible: number): void;

  // Required by Component
  render(width: number): string[] { /* ... */ }
  invalidate(): void { /* ... */ }
}
```

## Line Width Constraint

**Every line returned by `render(width)` must not exceed `width` columns.** The TUI will error if this constraint is violated.

Use these utilities to enforce the constraint:

```typescript
import { visibleWidth, truncateToWidth, wrapTextWithAnsi } from "@tsuuanmi/pi-tui";

// Option 1: Truncate long lines
return [truncateToWidth(this.text, width)];

// Option 2: Check and pad to exact width
const line = this.text;
const visible = visibleWidth(line);
if (visible > width) {
  return [truncateToWidth(line, width)];
}
return [line + " ".repeat(width - visible)]; // Pad for backgrounds
```

## SGR Reset

The TUI appends a full SGR reset and OSC 8 reset at the end of each rendered line. Styles do not carry across lines. Re-apply styles per line or use `wrapTextWithAnsi()` to preserve styles across wrapped lines.