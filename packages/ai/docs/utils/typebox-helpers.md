# TypeBox Helpers

Utility functions for working with TypeBox schemas in tool definitions.

## `createStringEnum()`

```typescript
import { createStringEnum } from "@tsuuanmi/pi-ai";

const StatusSchema = createStringEnum(["active", "inactive", "pending"]);
// Creates a TypeBox schema that validates string enum values
```

## `toJsonSchema()`

Converts TypeBox schemas to JSON Schema format for provider tool definitions.

## See Also

- [Tools](../tools.md) - Tool definition with TypeBox schemas
- [Validation](../validation.md) - Schema validation