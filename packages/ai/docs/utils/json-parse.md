# JSON Parse

Robust JSON parsing that handles common LLM output issues. All functions are exported from `@tsuuanmi/pi-ai`.

## `parseStreamingJson()`

```typescript
import { parseStreamingJson } from "@tsuuanmi/pi-ai";

// Handles incomplete JSON from streaming tool call arguments
const result = parseStreamingJson('{"key": "val');
// Returns: { key: "val" }
```

Parses potentially incomplete or malformed JSON strings produced by LLM streaming. Returns a best-effort object (never `undefined`); fields may be missing or incomplete while the stream is in progress. Used internally for streaming tool call argument parsing.

## `parseJsonWithRepair()`

```typescript
import { parseJsonWithRepair } from "@tsuuanmi/pi-ai";

const result = parseJsonWithRepair('{"key": "value",}');
// Returns: { key: "value" }
```

Repairs then parses a complete JSON string. Wraps `repairJson` followed by `JSON.parse`.

## `repairJson()`

```typescript
import { repairJson } from "@tsuuanmi/pi-ai";

const fixed = repairJson('{"key": "value",}');
// Returns: '{"key": "value"}'
```

Repairs common JSON issues like trailing commas, unquoted keys, and missing closing brackets. Returns the repaired JSON string (does not parse it).

## `sanitizeSurrogates()`

```typescript
import { sanitizeSurrogates } from "@tsuuanmi/pi-ai";

const safe = sanitizeSurrogates(textWithLoneSurrogates);
// Replaces lone surrogates with U+FFFD replacement characters
```

Ensures text does not contain unpaired surrogate code units, which can cause issues in JSON serialization and display. See [Sanitize Unicode](sanitize-unicode.md).

## See Also

- [Validation](../validation.md) - TypeBox schema validation
- [Sanitize Unicode](sanitize-unicode.md) - Surrogate sanitization
