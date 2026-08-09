# Agent Hooks

`src/hooks.ts` defines the public hook contracts used by `Agent.registerHook()`.

Hooks can observe or control:

- agent run start and completion;
- tool-call authorization before execution;
- tool-result transformation after execution;
- context/model/thinking updates before the next turn.

`AgentHookRegistry` validates names, rejects duplicate registrations, and preserves registration order.
