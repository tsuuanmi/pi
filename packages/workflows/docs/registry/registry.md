# Registry

Immutable workflow phase metadata plus split action and tool metadata.

**Source:** `src/registry/`

## Module Structure

| Module | Description |
|--------|-------------|
| `../policy/skill-policy.ts` | Immutable skill policies, gates, terminal detectors, and next-role selection. |
| `workflow-manifest-types.ts` | Public types for workflow manifests, verbs, typed arguments, transitions, and retention policies. |
| `workflow-runtime-manifest.ts` | Runtime-state manifest: phases, transitions, retention, HUD fields. |
| `workflow-manifest.ts` | Canonical workflow manifest that joins runtime state with skill action metadata. |
| `../skills/workflow-help-types.ts` | Shared types for skill command help and typed argument metadata. |
| `../skills/workflow-help-registry.ts` | Registry that combines per-skill action/help metadata for command help and validation. |
| `../skills/workflow-surface-types.ts` | Shared types for validated command/tool surface metadata. |
| `../skills/workflow-surface-registry.ts` | Registry that combines per-skill command/tool surface metadata. |
| `../skills/*/*-help.ts` | Per-skill action/help metadata used for workflow command help and command reference validation. |
| `../skills/*/*-surface.ts` | Per-skill command/tool surface metadata used by the validated tool registry. |

Runtime transitions require an exact canonical source phase; wildcard and compatibility transitions are not supported. Skill policies are imported explicitly and cannot be registered or replaced at runtime. Ralplan uses `complete` and `cancelled` as its canonical completion phases.

## See Also

- [Workflow control plane](../workflow.md)
- [Commands](../commands/workflow.md)
