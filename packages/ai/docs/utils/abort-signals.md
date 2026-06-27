# Abort Signals

Utilities for creating and managing abort signals for LLM request cancellation.

## `timeoutSignal()`

Creates an `AbortSignal` that aborts after a specified timeout:

```typescript
import { timeoutSignal } from "@tsuuanmi/pi-ai";

const signal = timeoutSignal(30000); // 30 second timeout
```

## `composeSignals()`

Composes multiple abort signals into one that aborts when any of them abort:

```typescript
import { composeSignals } from "@tsuuanmi/pi-ai";

const combined = composeSignals(timeoutSignal, userCancelSignal);
```

## See Also

- [Error Handling](../error-handling.md) - Abort handling patterns