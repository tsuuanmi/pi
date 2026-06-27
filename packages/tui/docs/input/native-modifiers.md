# Native Modifiers

Platform-specific modifier key detection using native system APIs.

## `isNativeModifierPressed()`

```typescript
import { isNativeModifierPressed } from "@tsuuanmi/pi-tui";

// Check if a modifier key is physically pressed
if (isNativeModifierPressed("command")) {
  // Command key is held down on macOS
}
```

### Modifier Keys

| Key | Platform | Description |
|-----|----------|-------------|
| `"shift"` | All | Shift key |
| `"command"` | macOS | Command (⌘) key |
| `"control"` | All | Control key |
| `"option"` | macOS | Option (⌥) key |

## Platform Support

Native modifier detection is only available on **macOS** (x64 and arm64). On all other platforms, `isNativeModifierPressed()` always returns `false`.

The native module is loaded from:
- `native/darwin/prebuilds/darwin-x64/darwin-modifiers.node` (Intel Macs)
- `native/darwin/prebuilds/darwin-arm64/darwin-modifiers.node` (Apple Silicon)

## Use Cases

- Detecting modifier keys held during drag operations
- Implementing click-modifier shortcuts (e.g., Command+Click)
- Distinguishing between key-down events and physically held modifiers

## See Also

- [Key Detection](keys.md) - Terminal key detection