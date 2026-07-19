# Keybindings

The TUI framework provides a global keybinding registry with declaration merging support.

## Default Keybindings

`TUI_KEYBINDINGS` defines the default keybinding map:

| Keybinding | Default Keys | Description |
|-----------|-------------|-------------|
| `tui.editor.cursorUp` | `up` | Move cursor up |
| `tui.editor.cursorDown` | `down` | Move cursor down |
| `tui.editor.cursorLeft` | `left`, `ctrl+b` | Move cursor left |
| `tui.editor.cursorRight` | `right`, `ctrl+f` | Move cursor right |
| `tui.editor.cursorWordLeft` | `alt+left`, `ctrl+left`, `alt+b` | Move cursor word left |
| `tui.editor.cursorWordRight` | `alt+right`, `ctrl+right`, `alt+f` | Move cursor word right |
| `tui.editor.cursorLineStart` | `home`, `ctrl+a` | Move to line start |
| `tui.editor.cursorLineEnd` | `end`, `ctrl+e` | Move to line end |
| `tui.editor.jumpForward` | `ctrl+]` | Jump forward to character |
| `tui.editor.jumpBackward` | `ctrl+alt+]` | Jump backward to character |
| `tui.editor.pageUp` | `pageUp` | Page up |
| `tui.editor.pageDown` | `pageDown` | Page down |
| `tui.editor.deleteCharBackward` | `backspace` | Delete character backward |
| `tui.editor.deleteCharForward` | `delete`, `ctrl+d` | Delete character forward |
| `tui.editor.deleteWordBackward` | `ctrl+w`, `alt+backspace` | Delete word backward |
| `tui.editor.deleteWordForward` | `alt+d`, `alt+delete` | Delete word forward |
| `tui.editor.deleteToLineStart` | `ctrl+u` | Delete to line start |
| `tui.editor.deleteToLineEnd` | `ctrl+k` | Delete to line end |
| `tui.editor.undo` | `ctrl+-` | Undo |
| `tui.input.newLine` | `shift+enter` | Insert newline |
| `tui.input.submit` | `enter` | Submit input |
| `tui.input.tab` | `tab` | Tab / autocomplete |
| `tui.input.copy` | `ctrl+c` | Copy selection |
| `tui.select.up` | `up` | Move selection up |
| `tui.select.down` | `down` | Move selection down |
| `tui.select.pageUp` | `pageUp` | Selection page up |
| `tui.select.pageDown` | `pageDown` | Selection page down |
| `tui.select.confirm` | `enter` | Confirm selection |
| `tui.select.cancel` | `escape` | Cancel selection |

## Custom Keybindings

Downstream packages can add keybindings via declaration merging:

```typescript
import { type KeybindingDefinitions } from "@tsuuanmi/pi-tui";

declare module "@tsuuanmi/pi-tui" {
  interface Keybindings {
    "myApp.submit": true;
    "myApp.cancel": true;
  }
}
```

## `KeybindingsManager`

```typescript
import { KeybindingsManager } from "@tsuuanmi/pi-tui";

const manager = new KeybindingsManager();

// Get current keybindings
const keybindings = manager.getKeybindings();

// Set custom keybindings
manager.setKeybindings({
  "tui.editor.deleteWordBackward": ["ctrl+w"],
  "tui.input.submit": ["enter", "ctrl+s"],
});

// Check for conflicts
const conflicts = manager.getConflicts();
```

## Getting and Setting Keybindings

```typescript
import { getKeybindings, setKeybindings } from "@tsuuanmi/pi-tui";

// Get the current keybinding configuration
const bindings = getKeybindings();

// Set keybinding overrides
setKeybindings({
  "tui.editor.deleteWordBackward": "ctrl+w",
});
```

## Keybinding Definition Interface

```typescript
interface KeybindingDefinition {
  defaultKeys: KeyId | KeyId[];
  description?: string;
}

type KeybindingsConfig = Record<string, KeyId | KeyId[] | undefined>;
```