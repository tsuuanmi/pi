# Ultragoal workflow commands

Use these commands with `--input` JSON objects. For exact payload validation, read `../assets/schema.json` and select the schema under `x-pi-actions["<action>"]`.

Command order for agents:

1. `pi workflow state ultragoal read --session <id> --json` to inspect state.
2. `pi workflow ultragoal status` or `pi workflow ultragoal read-compact` to inspect goals.
3. `pi workflow ultragoal create-plan` when no goal plan exists.
4. `pi workflow ultragoal start-next` before implementation.
5. `pi workflow ultragoal checkpoint` after progress or completion evidence.
6. `pi workflow ultragoal record-review-blockers` when review creates durable blockers.
7. `pi workflow ultragoal classify-blocker` only for policy-classified failed/blocked work.
8. `pi workflow ultragoal guard` when readiness or quality is uncertain.

Always pass the current session id as `sessionId` in action payloads. Complete checkpoints require the nested `qualityGate` shape from `../assets/schema.json`.
