# Hook Adapter

`src/hook-adapter.ts` adapts registered `AgentHook` values into the callback functions consumed by `AgentLoopConfig`.

The adapter keeps hook registration and lifecycle contracts separate from low-level loop execution. It combines hook results in registration order and stops before-tool execution when a hook blocks the call.
