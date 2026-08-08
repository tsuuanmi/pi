# Runtime

Session owner and primitive runtime shared by workflow command and tool adapters.

**Source:** `src/runtime/`

## Overview

The runtime owns workflow sessions, leases, RPC routing, fallback command execution, mutation receipts, state storage, preservation, GC, and finalization. Command adapters use it for the external control plane and owner/no-owner routing. Model-visible tools use shared workflow and skill runtime functions in-process; subagent spawns run through the main session's `SubagentManager` rather than through the detached runtime owner.

## Module Structure

| Module | Description |
|--------|-------------|
| `endpoint.ts` | Runtime endpoint helpers. |
| `gc.ts` | Liveness-only lease garbage collection. |
| `lease.ts` | Owner lease model and liveness classification. |
| `mutation.ts` | Runtime mutation path and receipt consistency guard. |
| `owner.ts` | Detached runtime owner lifecycle. |
| `preservation.ts` | State/artifact preservation helpers. |
| `fallback-commands.ts` | No-owner fallback command implementations. |
| `receipt-rules.ts` | Receipt-family post-state consistency rules. |
| `rpc.ts` | Runtime owner RPC client/server protocol. |
| `runner.ts` | Runtime command runner helpers. |
| `seams.ts` | Deferred-seam registry for designed-not-built extensions. |
| `lifecycle.ts` | Runtime lifecycle state and response helpers. |
| `storage.ts` | Runtime storage adapters and session paths. |
| `types.ts` | Runtime command, receipt, and state types. |
| `vanish.ts` | Session retire/vanish helpers. |

## Owner vs Primitive Paths

Most verbs route to a live runtime owner when one is running for the target session. If no owner is available, the command layer falls back to primitive implementations for inspection and safe progress/recovery so stale owners do not lock users out of state.

## See Also

- [Workflow control plane](../workflow.md)
- [Commands](../commands/workflow.md)
- [State](../state/state.md)
- [Session](../session/session.md)
- [Security](https://github.com/tsuuanmi/pi/tree/main/packages/pi/docs/app/security.md) - Sandbox boundaries
