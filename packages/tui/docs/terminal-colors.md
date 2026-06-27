# Terminal Colors

OSC 11 background color parsing for terminal theming.

## `parseOsc11BackgroundColor()`

```typescript
import { parseOsc11BackgroundColor, type RgbColor } from "@tsuuanmi/pi-tui";

const color: RgbColor | undefined = parseOsc11BackgroundColor(response);
```

Parses an OSC 11 terminal background color response. Supports:
- `rgb:RR/GG/BB` format
- `#RRGGBB` format
- `#RRRRGGGGBBBB` format

## `isOsc11BackgroundColorResponse()`

```typescript
import { isOsc11BackgroundColorResponse } from "@tsuuanmi/pi-tui";

if (isOsc11BackgroundColorResponse(data)) {
  const color = parseOsc11BackgroundColor(data);
}
```

Checks whether a terminal response string is an OSC 11 background color response.

## `RgbColor`

```typescript
interface RgbColor {
  r: number;
  g: number;
  b: number;
}
```

RGB color with values 0–255.

## See Also

- [Terminal Capabilities](capabilities.md) - Terminal feature detection