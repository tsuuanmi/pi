# Session

Session storage classes are no longer implemented or exported from `packages/agent/src`.

The current package provides lower-layer session-adjacent contracts and message helpers:

- [`ReadonlySessionManager`](../extension-contract.md) with `getSessionId()` for extension contexts.
- [Subagent records](../subagents.md) with session ids and session file metadata.
- [Messages](../messages.md) for custom, branch-summary, compaction-summary, and bash-execution transcript entries.

Durable JSONL session storage and tree reconstruction are host responsibilities outside `@tsuuanmi/pi-agent`.
