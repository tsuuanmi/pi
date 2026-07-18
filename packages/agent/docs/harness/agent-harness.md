# Agent Harness

`AgentHarness` is no longer implemented or exported from `packages/agent/src`.

The current `@tsuuanmi/pi-agent` package exposes lower-layer runtime APIs and contracts:

- [`Agent`](../agent.md)
- [`agentLoop()`](../agent-loop.md)
- [shared types](../types.md)
- [execution-environment contracts](env/nodejs.md)
- [subagent contracts](subagents.md)
- [extension contracts](extension-contract.md)

Host-level harness orchestration belongs in higher-layer packages rather than this package.
