# Registry

Workflow transition registry plus split workflow runtime/action/tool metadata.

**Source:** `src/registry/`

## Module Structure

| Module | Description |
|--------|-------------|
| `transition-registry.ts` | Runtime registry for skill transition tables, gates, terminal detectors, and next-role selectors. |
| `workflow-runtime-manifest.ts` | Runtime-state manifest: phases, transitions, retention, HUD fields. |
| `workflow-manifest.ts` | Canonical workflow manifest that joins runtime state with skill action metadata. |
| `../skills/*/*-help.ts` | Per-skill action/help metadata used for workflow command help and command reference validation. |
| `../skills/*/*-surface.ts` | Per-skill command/tool surface metadata used by the validated tool registry. |

Runtime transitions require an exact canonical source phase; wildcard and compatibility transitions are not supported. Ralplan uses `complete` and `cancelled` as its canonical completion phases.

## See Also

- [Workflow control plane](../workflow.md)
- [Commands](../commands/workflow.md)
