# Team workflow commands

Use these commands with JSON objects passed through `--input` or `--input-file`. Every skill action requires the current interactive/runtime `sessionId`; do not omit it. For exact payload validation, read `../assets/schema.json` and select the schema under `x-pi-actions["<action>"]`.

Command order for agents:

1. `pi workflow state team read --session <session-id> --json` to inspect state.
2. `pi workflow team start --input '{"sessionId":"<session-id>","task":"approved plan..."}' --json` with the approved task/plan.
3. `pi workflow team snapshot --input '{"sessionId":"<session-id>"}' --json` or `pi workflow team read-compact --input '{"sessionId":"<session-id>"}' --json` before assigning work.
4. `pi workflow team create-task --input '{"sessionId":"<session-id>","title":"...","description":"..."}' --json` for each independent workstream.
5. `pi workflow team transition-task --input '{"sessionId":"<session-id>","taskId":"task-1","status":"in_progress"}' --json` for start/block/fail/complete status changes.
6. `pi workflow team send-message --input '{"sessionId":"<session-id>","from":"lead","to":"task-1","body":"..."}' --json` for durable coordination.
7. `pi workflow team record-review-gate --input '{"sessionId":"<session-id>","taskId":"task-1","reviewReport":{}}' --json` after reviewer evidence.
8. `pi workflow team record-completion-gate --input '{"sessionId":"<session-id>","evidenceMatrix":{}}' --json` after prover evidence.
9. `pi workflow team complete --input '{"sessionId":"<session-id>","phase":"complete","summary":"..."}' --json` only after integration and verification.

Always pass the current session id as `sessionId` in action payloads. Execute workers/reviewers/prover only through `team_execute` or recover them with `team_resume`.
