# Components

Built-in components for common terminal UI patterns.

> Display, feedback, inputs, layout, and selection components are documented here. The HUD and status line modules have their own sub-sections: [HUD](hud/index.md) and [Status Line](status-line/index.md).

## Text

Displays multi-line text with word wrapping and padding:

```typescript
import { Text } from "@tsuuanmi/pi-tui";

const text = new Text(
  "Hello World",           // text content
  1,                       // paddingX (default: 1)
  1,                       // paddingY (default: 1)
  (text) => chalk.bgGray(text)  // optional background function
);

// Update content
text.setText("Updated text");

// Change background
text.setCustomBgFn((text) => chalk.bgBlue(text));
```

## TruncatedText

Single-line text that truncates to fit viewport width:

```typescript
import { TruncatedText } from "@tsuuanmi/pi-tui";

const truncated = new TruncatedText(
  "This is a very long line that will be truncated...",
  0,  // paddingX (default: 0)
  0   // paddingY (default: 0)
);
```

Useful for status lines and headers where text must fit on one line.

## Input

Single-line text input with horizontal scrolling:

```typescript
import { Input } from "@tsuuanmi/pi-tui";

const input = new Input();
input.onSubmit = (value) => console.log("Submitted:", value);
input.setValue("initial");
input.getValue();
```

**Key Bindings:**

| Key | Action |
|-----|--------|
| `Enter` | Submit |
| `Ctrl+A` / `Ctrl+E` | Line start/end |
| `Ctrl+W` / `Alt+Backspace` | Delete word backwards |
| `Ctrl+U` | Delete to start of line |
| `Ctrl+K` | Delete to end of line |
| `Ctrl+Left` / `Ctrl+Right` | Word navigation |
| `Alt+Left` / `Alt+Right` | Word navigation |
| Arrow keys | Character navigation |
| Backspace / Delete | Character deletion |

`Input` implements `Focusable` and emits `CURSOR_MARKER` for IME positioning.

## Editor

Multi-line text editor with autocomplete, file completion, paste handling, and vertical scrolling:

```typescript
import { Editor } from "@tsuuanmi/pi-tui";

interface EditorTheme {
  borderColor: (str: string) => string;
  selectList: SelectListTheme;
}

const editor = new Editor(tui, theme);
editor.onSubmit = (text) => console.log("Submitted:", text);
editor.onChange = (text) => console.log("Changed:", text);
editor.disableSubmit = true; // Disable submit temporarily
editor.setAutocompleteProvider(provider);
editor.borderColor = (s) => chalk.blue(s);
```

**Features:**
- Multi-line editing with word wrap
- Slash command autocomplete (type `/`)
- File path autocomplete (press `Tab`)
- Large paste handling (>10 lines creates `[paste #1 +50 lines]` marker)
- Horizontal lines above/below editor
- Fake cursor rendering (hidden real cursor)

**Key Bindings:**

| Key | Action |
|-----|--------|
| `Enter` | Submit |
| `Shift+Enter` / `Ctrl+Enter` / `Alt+Enter` | New line |
| `Tab` | Autocomplete |
| `Ctrl+K` | Delete to end of line |
| `Ctrl+U` | Delete to start of line |
| `Ctrl+W` / `Alt+Backspace` | Delete word backwards |
| `Alt+D` / `Alt+Delete` | Delete word forwards |
| `Ctrl+A` / `Ctrl+E` | Line start/end |
| `Ctrl+]` | Jump forward to character |
| `Ctrl+Alt+]` | Jump backward to character |
| `Ctrl+-` | Undo |

`Editor` implements `Focusable` and supports IME candidate window positioning.

## Markdown

Renders markdown with syntax highlighting and theming:

```typescript
import { Markdown } from "@tsuuanmi/pi-tui";

interface MarkdownTheme {
  heading: (text: string) => string;
  link: (text: string) => string;
  linkUrl: (text: string) => string;
  code: (text: string) => string;
  codeBlock: (text: string) => string;
  codeBlockBorder: (text: string) => string;
  quote: (text: string) => string;
  quoteBorder: (text: string) => string;
  hr: (text: string) => string;
  listBullet: (text: string) => string;
  bold: (text: string) => string;
  italic: (text: string) => string;
  strikethrough: (text: string) => string;
  underline: (text: string) => string;
  highlightCode?: (code: string, lang?: string) => string[];
}

interface DefaultTextStyle {
  color?: (text: string) => string;
  bgColor?: (text: string) => string;
  bold?: boolean;
  italic?: boolean;
  strikethrough?: boolean;
  underline?: boolean;
}

const md = new Markdown(
  "# Hello\n\nSome **bold** text",
  1,    // paddingX
  1,    // paddingY
  theme, // MarkdownTheme
  defaultStyle // optional DefaultTextStyle
);
md.setText("Updated markdown");
```

**Features:**
- Headings, bold, italic, code blocks, lists, links, blockquotes
- HTML tags rendered as plain text
- Optional syntax highlighting via `highlightCode`
- Padding and render caching

## Syntax Highlight

Wrapper around `highlight.js` that turns highlighted HTML into ANSI-styled terminal output.

- [Syntax Highlight](display/syntax-highlight.md) - `highlight`, `renderHighlightedHtml`, `supportsLanguage`.

## Visual Truncation

End-anchored wrapping-aware truncation for text buffers and other wrapped displays.

- [Visual Truncation](display/visual-truncate.md) - `truncateToVisualLines` and `VisualTruncateResult`.

## Loader

Animated loading spinner:

```typescript
import { Loader } from "@tsuuanmi/pi-tui";

const loader = new Loader(
  tui,                               // TUI instance for render updates
  (s) => chalk.cyan(s),             // spinner color function
  (s) => chalk.gray(s),             // message color function
  "Loading..."                        // message (default: "Loading...")
);
loader.start();
loader.setMessage("Still loading...");
loader.stop();
```

## CancellableLoader

Extends `Loader` with Escape key handling and `AbortSignal`:

```typescript
import { CancellableLoader } from "@tsuuanmi/pi-tui";

const loader = new CancellableLoader(
  tui,
  (s) => chalk.cyan(s),
  (s) => chalk.gray(s),
  "Working..."
);
loader.onAbort = () => done(null);
doAsyncWork(loader.signal).then(done);
```

**Properties:**

| Property | Type | Description |
|----------|------|-------------|
| `signal` | `AbortSignal` | Aborted when user presses Escape |
| `aborted` | `boolean` | Whether the loader was aborted |
| `onAbort` | `() => void` | Callback when user presses Escape |

## SelectList

Interactive selection list with keyboard navigation:

```typescript
import { SelectList } from "@tsuuanmi/pi-tui";

interface SelectItem {
  value: string;
  label: string;
  description?: string;
}

interface SelectListTheme {
  selectedPrefix: (text: string) => string;
  selectedText: (text: string) => string;
  description: (text: string) => string;
  scrollInfo: (text: string) => string;
  noMatch: (text: string) => string;
}

const list = new SelectList(
  [
    { value: "opt1", label: "Option 1", description: "First option" },
    { value: "opt2", label: "Option 2", description: "Second option" },
  ],
  5,      // maxVisible
  theme   // SelectListTheme
);

list.onSelect = (item) => console.log("Selected:", item);
list.onCancel = () => console.log("Cancelled");
list.onSelectionChange = (item) => console.log("Highlighted:", item);
list.setFilter("opt"); // Filter items
```

**Controls:** Arrow keys to navigate, Enter to select, Escape to cancel.

## SettingsList

Settings panel with value cycling and submenus:

```typescript
import { SettingsList } from "@tsuuanmi/pi-tui";

interface SettingItem {
  id: string;
  label: string;
  description?: string;
  currentValue: string;
  values?: string[];  // If provided, Enter/Space cycles through these
  submenu?: (currentValue: string, done: (selectedValue?: string) => void) => Component;
}

interface SettingsListTheme {
  label: (text: string, selected: boolean) => string;
  value: (text: string, selected: boolean) => string;
  description: (text: string) => string;
  cursor: string;
  hint: (text: string) => string;
}

const settings = new SettingsList(
  [
    { id: "theme", label: "Theme", currentValue: "dark", values: ["dark", "light"] },
    { id: "model", label: "Model", currentValue: "gpt-4", submenu: (val, done) => modelSelector },
  ],
  10,     // maxVisible
  theme,  // SettingsListTheme
  (id, newValue) => console.log(`${id} changed to ${newValue}`),
  () => console.log("Cancelled")
);

settings.updateValue("theme", "light");
```

**Controls:** Arrow keys to navigate, Enter/Space to activate (cycle value or open submenu), Escape to cancel.

## Layout Spacing

Shared spacing constants keep screen gutters and section gaps consistent across components:

```typescript
import { LAYOUT_EDGE_X, LAYOUT_SECTION_GAP_Y, Spacer } from "@tsuuanmi/pi-tui";

const inset = LAYOUT_EDGE_X; // standard left/right gutter
const spacer = new Spacer(LAYOUT_SECTION_GAP_Y); // standard section gap
```

## Spacer

Empty lines for vertical spacing:

```typescript
import { Spacer } from "@tsuuanmi/pi-tui";

const spacer = new Spacer(2); // 2 empty lines (default: 1)
```

## Container

Groups child components:

```typescript
import { Container } from "@tsuuanmi/pi-tui";

const container = new Container();
container.addChild(component1);
container.addChild(component2);
container.removeChild(component1);
```

## Box

Container that applies padding and background color to all children:

```typescript
import { Box } from "@tsuuanmi/pi-tui";

const box = new Box(
  1,                              // paddingX (default: 1)
  1,                              // paddingY (default: 1)
  (text) => chalk.bgGray(text)   // optional background function
);
box.addChild(new Text("Content"));
box.setBgFn((text) => chalk.bgBlue(text)); // Change background dynamically
```