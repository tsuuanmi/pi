# Key Detection

The TUI framework provides a key detection system that supports both legacy terminal sequences and the Kitty keyboard protocol.

## `matchesKey()`

Match raw terminal input against key identifiers:

```typescript
import { matchesKey, Key } from "@tsuuanmi/pi-tui";

if (matchesKey(data, Key.ctrl("c"))) {
  process.exit(0);
}

if (matchesKey(data, Key.enter)) {
  submit();
} else if (matchesKey(data, Key.escape)) {
  cancel();
} else if (matchesKey(data, Key.up)) {
  moveUp();
}
```

## Key Identifiers

Use `Key.*` for IDE auto-completion, or string literals:

**Basic keys:** `Key.enter`, `Key.escape`, `Key.tab`, `Key.space`, `Key.backspace`, `Key.delete`, `Key.home`, `Key.end`

**Arrow keys:** `Key.up`, `Key.down`, `Key.left`, `Key.right`

**With modifiers:** `Key.ctrl("c")`, `Key.shift("tab")`, `Key.alt("left")`, `Key.ctrlShift("p")`

**String format also works:** `"enter"`, `"ctrl+c"`, `"shift+tab"`, `"ctrl+shift+p"`

## `parseKey()`

Parse raw terminal input and return the key identifier:

```typescript
import { parseKey } from "@tsuuanmi/pi-tui";

const keyId = parseKey(data);
// Returns: "enter", "ctrl+c", "up", "shift+tab", etc.
// Returns undefined if input cannot be parsed
```

## Kitty Keyboard Protocol

The TUI framework supports the Kitty keyboard protocol for enhanced key reporting:

- Reports key events, releases, and repeats
- Distinguishes modifier combinations precisely
- Reports key type (press, repeat, release)

### Kitty Protocol State

```typescript
import { isKittyProtocolActive, setKittyProtocolActive } from "@tsuuanmi/pi-tui";

// Query state (set by ProcessTerminal after negotiation)
if (isKittyProtocolActive()) {
  console.log("Kitty keyboard protocol is active");
}

// Set state (normally done by ProcessTerminal, not user code)
setKittyProtocolActive(true);
```

### Key Release Events

By default, key release events are filtered out. Components that need release events set `wantsKeyRelease`:

```typescript
class MyComponent implements Component {
  wantsKeyRelease = true;

  handleInput(data: string): void {
    if (isKeyRelease(data)) {
      // Handle key release
    }
  }
}
```

### Key Repeat Events

```typescript
import { isKeyRepeat } from "@tsuuanmi/pi-tui";

if (isKeyRepeat(data)) {
  // Handle key repeat (held down)
}
```

### Kitty Printable Characters

```typescript
import { decodeKittyPrintable } from "@tsuuanmi/pi-tui";

// Decode Kitty protocol printable character data
const decoded = decodeKittyPrintable(data);
```

## `StdinBuffer`

`StdinBuffer` buffers raw stdin data and emits complete escape sequences. This is necessary because stdin data events can arrive in partial chunks, especially for escape sequences like mouse events.

```typescript
import { StdinBuffer } from "@tsuuanmi/pi-tui";

const buffer = new StdinBuffer({
  onSequence: (sequence) => {
    // Complete sequence received
  },
});

buffer.process(rawData);
```

### Bracketed Paste Mode

`StdinBuffer` detects bracketed paste sequences (`ESC[200~` ... `ESC[201~`) and emits them as a single paste event rather than individual key events.

### Event Map

| Event | Description |
|-------|-------------|
| `sequence` | Complete escape sequence |
| `paste` | Bracketed paste content |
| `resize` | Terminal resize detected |