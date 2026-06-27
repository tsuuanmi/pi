# Hash

Short hash generation for session and request identifiers.

## `shortHash()`

```typescript
import { shortHash } from "@tsuuanmi/pi-ai";

const hash = shortHash("some input string"); // e.g., "a1b2c3d4"
```

Generates a deterministic short hash from an input string. Used for creating unique identifiers without exposing full input data.

## See Also

- [Utilities](../utilities.md) - All utility functions