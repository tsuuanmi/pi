# Runtime

Session owner and primitive runtime shared by workflow command and tool adapters.

**Source:** `src/runtime/`

## Overview

The runtime owns workflow sessions, leases, RPC routing, mutation receipts, state storage, preservation, GC, recovery, validation, and finalization. Command adapters use it for the external control plane and explicit owner or recovery routing. Model-visible tools use shared workflow and skill runtime functions in-process; subagent spawns run through the main session's `SubagentManager` rather than through the detached runtime owner.

## Module Structure

| Module | Description |
|--------|-------------|
| `endpoint.ts` | Runtime endpoint helpers. |
| `gc.ts` | Liveness-only lease garbage collection. |
| `finalization.ts` | Validation-gated workflow completion. |
| `lease.ts` | Owner lease model and liveness classification. |
| `lifecycle.ts` | Runtime lifecycle state and response helpers. |
| `mutation.ts` | Runtime mutation path and receipt consistency guard. |
| `owner.ts` | Detached runtime owner lifecycle. |
| `preservation.ts` | State and artifact preservation helpers. |
| `receipt-rules.ts` | Receipt-family post-state consistency rules. |
| `recovery-policy.ts` | Pure recovery classification and retry-budget policy. |
| `recovery.ts` | Recovery context and action orchestration. |
| `rpc.ts` | Runtime owner RPC client/server protocol. |
| `runner.ts` | Owner-driven lifecycle loop. |
| `storage.ts` | Runtime storage adapters and session paths. |
| `types.ts` | Runtime command, receipt, and state types. |
| `validation.ts` | Validation command execution and receipt selection. |
| `vanish.ts` | Session retire and vanish evidence helpers. |
| `workspace-marker.ts` | Git workspace identity and delta classification. |

## Owner and Recovery Paths

Lifecycle mutations route to the live runtime owner. Read-only inspection remains available without an owner, while recovery explicitly acquires its own lease before changing state or restarting an owner. These are separate command paths rather than fallback implementations.

## See Also

- [Workflow control plane](../workflow.md)
- [Commands](../commands/workflow.md)
- [State](../state/state.md)
- [Canonical `.pi` Session Layout](../../../pi/docs/session/layout.md)
- [Security](https://github.com/tsuuanmi/pi/tree/main/packages/pi/docs/app/security.md) - Sandbox boundaries
