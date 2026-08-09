# Default Runtime

`src/default-runtime.ts` defines `DefaultAgentRuntime`, the standard LLM/tool-loop implementation.

It runs the low-level loop, forwards lifecycle events, aggregates tool calls, warnings, traces, backend metadata, and returns a `RunResult` through the runtime event stream.
