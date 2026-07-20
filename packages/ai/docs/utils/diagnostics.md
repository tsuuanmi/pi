# Diagnostics

Structured diagnostic collection for assistant message failures and recoveries.

## Usage

Diagnostics are attached to an `AssistantMessage` via its `diagnostics` array. The package exports helpers to build and append them:

```typescript
import {
  createAssistantMessageDiagnostic,
  appendAssistantMessageDiagnostic,
  extractDiagnosticError,
  formatThrownValue,
  type AssistantMessageDiagnostic,
  type DiagnosticErrorInfo,
} from "@tsuuanmi/pi-ai";
```

## Types

```typescript
interface DiagnosticErrorInfo {
  name?: string;
  message: string;
  stack?: string;
  code?: string | number;
}

interface AssistantMessageDiagnostic {
  type: string;
  timestamp: number;
  error?: DiagnosticErrorInfo;
  details?: Record<string, unknown>;
}
```

## Helpers

| Function | Description |
|----------|-------------|
| `createAssistantMessageDiagnostic(type, error, details?)` | Build a diagnostic entry from a thrown value |
| `appendAssistantMessageDiagnostic(message, diagnostic)` | Append a diagnostic to a message's `diagnostics` array |
| `extractDiagnosticError(error)` | Normalize a thrown value into a `DiagnosticErrorInfo` |
| `formatThrownValue(value)` | Render a thrown value as a string |

The `diagnostics` field is appended internally by the library when provider errors or unusual conditions are detected; it is not populated on normal successful responses.

## See Also

- [Error Handling](../error-handling.md) - Error recovery patterns and the `diagnostics` field
