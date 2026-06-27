# JSON Parse

Robust JSON parsing that handles common LLM output issues.

## `parseStreamingJson()`

```typescript
import { parseStreamingJson } from "@tsuuanmi/pi-ai";

// Handles incomplete JSON from streaming tool call arguments
const result = parseStreamingJson('{"key": "val');
// Returns: { key: "val" }
```

Parses potentially incomplete or malformed JSON strings produced by LLM streaming. Handles:
- Truncated JSON objects
- Missing closing braces/brackets
- Partial string values

## `repairJson()`

```typescript
import { repairJson } from "@tsuuanmi/pi-ai";

const result = repairJson('{"key": "value",}');
// Returns: { key: "value" }
```

Repairs common JSON issues like trailing commas, unquoted keys, and missing closing brackets.

## See Also

- [Validation](../validation.md) - TypeBox schema validation