# Harness Runtime

Session owner and primitive runtime for `pi workflow` commands.

**Source:** `src/harness/runtime/`

## Overview

The runtime owns workflow sessions, leases, RPC routing, primitive fallback execution, mutation receipts, state storage, preservation, GC, and finalization. It is the command/control substrate used by `src/commands/workflow.ts`; model-visible subagent spawns still run in-process through the main session's `SubagentManager`.

## Module Structure

| Module | Description |
|--------|-------------|
| `endpoint.ts` | Runtime endpoint helpers. |
| `gc.ts` | Liveness-only lease garbage collection. |
| `lease.ts` | Owner lease model and liveness classification. |
| `mutation.ts` | Runtime mutation path and receipt consistency guard. |
| `owner.ts` | Detached runtime owner lifecycle. |
| `preservation.ts` | State/artifact preservation helpers. |
| `primitives.ts` | No-owner primitive command fallback implementations. |
| `receipt-rules.ts` | Receipt-family post-state consistency rules. |
| `rpc.ts` | Runtime owner RPC client/server protocol. |
| `runner.ts` | Runtime command runner helpers. |
| `seams.ts` | Deferred-seam registry for designed-not-built extensions. |
| `state.ts` | Runtime state model helpers. |
| `storage.ts` | Runtime storage adapters and session paths. |
| `types.ts` | Runtime command, receipt, and state types. |
| `vanish.ts` | Session retire/vanish helpers. |

## Owner vs Primitive Paths

Most verbs route to a live runtime owner when one is running for the target session. If no owner is available, the command layer falls back to primitive implementations for inspection and safe progress/recovery so stale owners do not lock users out of state.

## See Also

- [Workflow control plane](../../workflow.md)
- [Security](https://github.com/tsuuanmi/pi/tree/main/packages/coding-agent/docs/core/trust/security.md) - Sandbox boundaries
