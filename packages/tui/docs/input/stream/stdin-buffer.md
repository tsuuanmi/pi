# Input Buffer

`StdinBuffer` buffers raw stdin data and emits complete escape sequences, handling partial chunks and bracketed paste.

## `StdinBuffer`

```typescript
import { StdinBuffer } from "@tsuuanmi/pi-tui";

const buffer = new StdinBuffer({ timeout: 10 });
buffer.on("data", (sequence: string) => {
  // Process complete key sequences
});
buffer.on("paste", (text: string) => {
  // Process pasted text
});
```

### Options

```typescript
interface StdinBufferOptions {
  /** Maximum time to wait for sequence completion (default: 10ms) */
  timeout?: number;
}
```

### Methods

| Method | Description |
|--------|-------------|
| `process(data)` | Feed input data (string or Buffer) to the buffer |
| `flush()` | Flush any buffered data and return sequences |
| `clear()` | Clear the buffer and reset state |
| `getBuffer()` | Get current buffer contents |
| `destroy()` | Clear and clean up |

### Events

| Event | Payload | Description |
|-------|---------|-------------|
| `data` | `string` | Complete key sequence or regular character |
| `paste` | `string` | Bracketed paste content |

## How It Works

Stdin data arrives in partial chunks. Escape sequences like `\x1b[A` (Up arrow) or `\x1b[<35;20;5m` (SGR mouse) may arrive across multiple data events. The buffer accumulates data until a complete sequence is detected.

### Sequence Detection

The buffer handles:
- **CSI sequences**: `ESC [ ... final_byte`
- **OSC sequences**: `ESC ] ... ST`
- **DCS sequences**: `ESC P ... ST`
- **APC sequences**: `ESC _ ... ST`
- **SS3 sequences**: `ESC O char`
- **Meta keys**: `ESC char`
- **Bracketed paste**: `ESC[200~ ... ESC[201~`

### Kitty Keyboard Protocol

When Kitty keyboard protocol is active, the buffer handles concatenated ESC + Kitty CSI-u sequences by emitting only the initial ESC and restarting from the Kitty sequence.

## See Also

- [Key Detection](../keyboard/keys.md) - `matchesKey()` and `Key` helper
- [Keybindings](../keyboard/keybindings.md) - Keybinding configuration