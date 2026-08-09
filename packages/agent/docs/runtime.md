# Runtime Contract

`src/runtime.ts` defines `AgentBackend` and `AgentRuntime`.

A runtime backend consumes a `RunRequest` and asynchronously yields `RuntimeEvent` values. Node-only packages can provide process- or protocol-backed implementations without changing the standard agent loop.
