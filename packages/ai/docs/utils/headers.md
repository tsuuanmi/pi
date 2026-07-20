# HTTP Headers

Header conversion utility for provider responses and requests.

## `headersToRecord()`

```typescript
import { headersToRecord } from "@tsuuanmi/pi-ai";
```

Converts a `Headers` instance (or any `Record<string, string>`-like object with `forEach`) into a flat `Record<string, string>`. Used internally to normalize provider response headers into a plain object.

```typescript
const record = headersToRecord(response.headers);
// record: { "content-type": "application/json", ... }
```

## See Also

- [API Registry](../providers/api-registry.md) - Provider configuration
- [Event Stream](event-stream.md) - `headersToRecord` is exported alongside `EventStream`
