# Durable Harness

Durable harness/session orchestration is no longer implemented or exported from `packages/agent/src`.

This package now provides the lower-layer pieces used by durable hosts:

- [message conversion helpers](messages.md)
- [execution-environment contracts](env/nodejs.md)
- [subagent record/request/result contracts](subagents.md)
- [extension contracts](extension-contract.md)
- [tool registration](../tools.md)

Durable persistence and recovery are host responsibilities outside `@tsuuanmi/pi-agent`.
