# Keybinding Hints

Formatting helpers for host-scoped keybinding hints and labels.

```typescript
interface KeyTextFormatOptions { capitalize?: boolean; }

function formatKeyText(key: string, options?: KeyTextFormatOptions): string;
function keyText(keybindings: KeybindingsManager, keybinding: Keybinding): string;
function keyDisplayText(keybindings: KeybindingsManager, keybinding: Keybinding): string;
function keyHint(keybindings: KeybindingsManager, keybinding: Keybinding, description: string): string;
function rawKeyHint(key: string, description: string): string;
```

## Behavior

Key strings use `/` to separate alternatives and `+` to combine chord parts, such as `ctrl+k/enter`. `formatKeyText` formats each part; on macOS, `alt` is displayed as `option`.

`keyText`, `keyDisplayText`, and `keyHint` require the host's `KeybindingsManager`. They never consult global state:

```typescript
const label = keyText(keybindings, "app.open");
const displayLabel = keyDisplayText(keybindings, "app.open");
const hint = keyHint(keybindings, "tui.select.cancel", "cancel");
```

`rawKeyHint` formats a literal key string when no action lookup is needed.

Both hint helpers render a dim key followed by a muted description through the active [theme](../../theme/index.md).

## See also

- [Keybindings](keybindings.md)
- [Key detection](keys.md)
