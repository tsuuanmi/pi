# Terminal Capabilities

The `detectCapabilities()` function checks the terminal for true color and OSC 8 hyperlink support.

## Detection

```typescript
import { detectCapabilities } from "@tsuuanmi/pi-tui";

const caps = detectCapabilities();
console.log(caps.trueColor);  // boolean
console.log(caps.hyperlinks);  // boolean
```

## Terminal Identification

The detection logic checks environment variables in order:

| Check | True Color | Hyperlinks |
|-------|-----------|------------|
| `TMUX` or `TERM~=/^tmux/` | `COLORTERM` check | Probed via tmux |
| `screen` (`TERM~=/^screen/`) | `COLORTERM` check | `false` |
| `KITTY_WINDOW_ID` or `TERM_PROGRAM=kitty` | `true` | `true` |
| `TERM_PROGRAM=ghostty` or `GHOSTTY_RESOURCES_DIR` | `true` | `true` |
| `WEZTERM_PANE` or `TERM_PROGRAM=wezterm` | `true` | `true` |
| `ITERM_SESSION_ID` or `TERM_PROGRAM=iterm.app` | `true` | `true` |
| `TERM_PROGRAM=vscode` | `true` | `true` |
| `TERM_PROGRAM=alacritty` | `true` | `true` |
| `TERMINAL_EMULATOR=jetbrains-jediterm` | `true` | `false` |
| Unknown terminal | `COLORTERM` check | `false` (conservative) |

### tmux Hyperlink Detection

For tmux sessions, the function probes `tmux display-message -p '#{client_termfeatures}'` to check if the outer terminal forwards OSC 8 hyperlinks. On any error, it falls back to `false`.

## Setting Capabilities

```typescript
import { setCapabilities, getCapabilities } from "@tsuuanmi/pi-tui";

// Override detected capabilities
setCapabilities({ trueColor: true, hyperlinks: false });

// Get current capabilities
const caps = getCapabilities();

// Reset to auto-detected values
resetCapabilitiesCache();
```

## Hyperlink Generation

```typescript
import { hyperlink } from "@tsuuanmi/pi-tui";

// Only generates hyperlinks when capabilities indicate support
const link = hyperlink("Click here", "https://example.com", caps);
// Returns: "\x1b]8;;https://example.com\x1b\\Click here\x1b]8;;\x1b\\"
// Or: "Click here (https://example.com)" if hyperlinks not supported
```

## Terminal Color Parsing

```typescript
import { parseOsc11BackgroundColor, type RgbColor } from "@tsuuanmi/pi-tui";

// Parse OSC 11 background color response
const color: RgbColor | undefined = parseOsc11BackgroundColor(response);
// Supports formats: rgb:RR/GG/BB, #RRGGBB, #RRRRGGGGBBBB
```

## Caching

Capability detection results are cached after the first call. Use `resetCapabilitiesCache()` to force re-detection, or `setCapabilities()` to override.