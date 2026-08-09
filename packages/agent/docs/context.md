# Agent Context

`src/context.ts` defines `AgentContext`, the host-neutral snapshot passed through the agent loop and runtime boundary.

It contains the system prompt, current `AgentMessage[]`, and registered host tools. Higher-level packages own context construction and mutation.
