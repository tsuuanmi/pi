# Registry

Built-in skill registry plus split workflow runtime/action/tool metadata.

**Source:** `src/registry/`

## Module Structure

| Module | Description |
|--------|-------------|
| `skill-registry.ts` | Built-in skill registry for `deep-interview`, `ralplan`, `team`, and `ultragoal`. |
| `workflow-runtime-manifest.ts` | Runtime-state manifest: phases, transitions, retention, HUD fields. |
| `workflow-manifest.ts` | Compatibility aggregate that preserves the historical manifest shape by joining runtime state with skill action metadata. |
| `../skills/*/*-help.ts` | Per-skill action/help metadata used for workflow command help and command reference validation. |
| `../skills/*/*-surface.ts` | Per-skill command/tool surface metadata used by the validated tool registry. |

## See Also

- [Workflow control plane](../workflow.md)
- [Commands](../commands/workflow.md)
