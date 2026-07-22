# State Commands

Agent-facing usage for `pi workflow state`.

## Rule of Thumb

- `--session <id>` is always a CLI argument.
- `--to <skill>` is a CLI argument for `handoff`.
- `--input` / `--input-file` are only for `write` and optional `clear` payloads.
- Do not put `sessionId` in the JSON payload.

## Commands

```text
pi workflow state <skill> read --session <id> --json
pi workflow state <skill> write --session <id> --input '{...}' --json
pi workflow state <skill> clear --session <id> [--force] --json
pi workflow state <skill> handoff --to <skill> --session <id> --json
pi workflow state active --session <id> --json
pi workflow state <skill> doctor --session <id> --json
```

## Payload Shape

Use the state schema at `src/state/assets/schema.json` for the exact JSON contract.

- `read`, `active`, and `doctor` take no JSON input.
- `handoff` takes no JSON input; the target skill goes in `--to`.
- `write` accepts a state patch such as:

```json
{ "active": true, "current_phase": "planner" }
```

- `clear` usually takes no JSON input; use `--force` only for recovery.

## Examples

```bash
pi workflow state ralplan read --session h-... --json
pi workflow state team write --session h-... --input '{"active":true,"current_phase":"running"}' --json
pi workflow state deep-interview handoff --to ralplan --session h-... --json
pi workflow state ultragoal doctor --session h-... --json
```

## See Also

- [State overview](state.md)
- [Workflow control plane](../workflow.md)
