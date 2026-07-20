# Keybinding Hints

Formatting helpers for keybinding hints and labels in the terminal UI.

```typescript
interface KeyTextFormatOptions { capitalize?: boolean; }

function formatKeyText(key: string, options?: KeyTextFormatOptions): string;
function keyText(keybinding: Keybinding): string;
function keyDisplayText(keybinding: Keybinding): string;
function keyHint(keybinding: Keybinding, description: string): string;
function rawKeyHint(key: string, description: string): string;
```

## Behavior

Key strings use `/` to separate sequential keys and `+` to combine chords (e.g. `ctrl+k/enter`). `formatKeyText` splits on both and formats each part.

- On macOS, the `alt` part is displayed as `option`.
- `capitalize` uppercases the first letter of each part.

## Resolving keybindings

`keyText` and `keyDisplayText` resolve a `Keybinding` name to its concrete keys via the active `KeybindingsManager` (see [Keybindings](../input/keyboard/keybindings.md)):

- `keyText(keybinding)` — lowercase key text.
- `keyDisplayText(keybinding)` — capitalized key text.

## Hint helpers

Both produce a dim key followed by a muted description, colored via the active [Theme](../theme/index.md):

- `keyHint(keybinding, description)` — resolves the keybinding then formats.
- `rawKeyHint(key, description)` — formats a raw key string without resolution.

## See Also

- [Keybindings](../input/keyboard/keybindings.md) — `getKeybindings`, `Keybinding`, `KeybindingsManager`.
- [Key Detection](../input/keyboard/keys.md) — `KeyId`, `Key`.