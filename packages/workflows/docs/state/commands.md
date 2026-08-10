# State Commands

Agent-facing usage for strict workflow-state inspection and clearing.

## Contract

- `--session <id>` is required and is the only session-id source.
- Skill and action are positional and required.
- State commands do not accept JSON input.
- Workflow mutations and handoffs belong to skill actions, not the generic state adapter.

## Commands

```text
pi workflow state <skill> read --session <id> --json
pi workflow state <skill> clear --session <id> --json
pi workflow state <skill> doctor --session <id> --json
pi workflow state active --session <id> --json
```

`clear` accepts only valid canonical state. Corrupt or unsupported state must be diagnosed rather than overwritten.

## Examples

```bash
pi workflow state ralplan read --session 20260809-144450 --json
pi workflow state team clear --session 20260809-144450 --json
pi workflow state active --session 20260809-144450 --json
pi workflow state ultragoal doctor --session 20260809-144450 --json
```

Use the schema at `src/state/assets/schema.json` for the exact command surface.

## See Also

- [State overview](state.md)
- [Workflow control plane](../workflow.md)
