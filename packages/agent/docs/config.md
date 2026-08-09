# Runtime Configuration

`src/config.ts` contains the configuration contracts for the low-level agent loop and provider requests.

- `AgentLoopConfig` controls model calls, context conversion, queue handling, tool execution, observers, limits, and lifecycle callbacks.
- `ProviderRequestObserver` receives provider request start, payload, response, and completion events.
- `ToolExecutionMode` selects sequential or parallel tool execution.
- `QueueMode` controls message queue draining.

Configuration is passed into `agentLoop()`, `agentLoopContinue()`, and runtime requests.
