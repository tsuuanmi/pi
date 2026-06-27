# Sanitize Unicode

Unicode sanitization for LLM output and input handling.

## `sanitizeSurrogates()`

```typescript
import { sanitizeSurrogates } from "@tsuuanmi/pi-ai";

const safe = sanitizeSurrogates(textWithLoneSurrogates);
// Replaces lone surrogates with U+FFFD replacement characters
```

Ensures text does not contain unpaired surrogate code units, which can cause issues in JSON serialization and display.

## See Also

- [Validation](../validation.md) - Input validation utilities