# TypeBox Helpers

Utility functions for working with TypeBox schemas in tool definitions.

## `StringEnum()`

```typescript
import { StringEnum } from "@tsuuanmi/pi-ai";

const StatusSchema = StringEnum(["active", "inactive", "pending"]);
// Creates a TypeBox schema that validates string enum values
```

## See Also

- [Tools](../tools.md) - Tool definition with TypeBox schemas
- [Validation](../validation.md) - Schema validation