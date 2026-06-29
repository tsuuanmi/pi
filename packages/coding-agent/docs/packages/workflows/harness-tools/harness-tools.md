# Harness Tools

Tool implementations exposed to the agent during workflow execution.

**Source:** `src/packages/workflows/runtime/harness-tools/`

## Overview

The harness-tools module provides specialized tools available to subagent sessions during workflow execution. These tools are registered via `registerHarnessTools(pi)` and complement the built-in tools.

## Tools

### yield

Structured completion tool for subagent sessions. When a subagent calls `yield`, it signals completion with structured output:

```typescript
interface YieldDetails {
  data: unknown;
  status: "success" | "aborted";
  error?: string;
}
```

The parent `SubagentManager` detects yield calls in the subagent's tool results via `extractYieldFromMessages()`, which walks messages in reverse to find the most recent yield tool result.

#### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `data` | unknown | yes | Structured output data |
| `status` | enum | yes | `"success"` or `"aborted"` |
| `error` | string | no | Error message if status is `"aborted"` |

#### Yield Detection

```typescript
function extractYieldFromMessages(
  messages: readonly AgentMessage[]
): YieldDetails | undefined;
```

Walks messages in reverse to find the most recent yield tool result. Used by `SubagentManager` to detect structured completion.

### fetch

HTTP fetch tool for making web requests during workflow execution. Provides a simplified HTTP client for subagents that need to access external resources.

#### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `url` | string | yes | URL to fetch |
| `method` | string | no | HTTP method (default: `"GET"`) |
| `headers` | object | no | HTTP headers |
| `body` | string | no | Request body |

## Registration

```typescript
import { registerHarnessTools } from "@tsuuanmi/pi-coding-agent/workflows";

pi.on("session_start", (_event, ctx) => {
  registerHarnessTools(pi);
});
```

Both `yield` and `fetch` are registered as tool definitions that can be overridden per workflow phase.

## See Also

- [Subagents](../../core/subagents/subagents.md) - SubagentManager and subagent lifecycle
- [Tools](../../core/tools/tools.md) - Built-in tool system