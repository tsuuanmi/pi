# Agent Context

`src/context.ts` defines `Context`, the host-neutral snapshot passed through the internal agent loop.

It contains the system prompt, current `AgentMessage[]`, and registered host tools. Higher-level packages own context construction and mutation.
