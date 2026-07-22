# Team workflow commands

Use these commands with `--input` JSON objects. For exact payload validation, read `../assets/schema.json` and select the schema under `x-pi-actions["<action>"]`.

Command order for agents:

1. `pi workflow state team read --session <id> --json` to inspect state.
2. `pi workflow team start` with the approved task/plan.
3. `pi workflow team snapshot` or `pi workflow team read-compact` before assigning work.
4. `pi workflow team create-task` for each independent workstream.
5. `pi workflow team transition-task` for start/block/fail/complete status changes.
6. `pi workflow team send-message` for durable coordination.
7. `pi workflow team record-review-gate` after reviewer evidence.
8. `pi workflow team record-completion-gate` after prover evidence.
9. `pi workflow team complete` only after integration and verification.

Always pass the current session id as `sessionId` in action payloads. Spawn workers/reviewers/prover only through guarded team tools.
