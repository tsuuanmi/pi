# Ralplan workflow commands

Use these commands with JSON objects passed through `--input` or `--input-file`. Every skill action requires the current interactive/runtime `sessionId`; do not omit it. For exact payload validation, read `../assets/schema.json` and select the schema under `x-pi-actions["<action>"]`.

Command order for agents:

1. `pi workflow state ralplan read --session <session-id> --json` to inspect state.
2. `pi workflow ralplan status --input '{"sessionId":"<session-id>"}' --json` to inspect the active run.
3. `pi workflow ralplan read-compact --input '{"sessionId":"<session-id>"}' --json` when resuming or budgeting context.
4. `pi workflow ralplan doctor --input '{"sessionId":"<session-id>"}' --json` when resuming or when status looks inconsistent.
5. `pi workflow ralplan record-explorer-gate --input '{"sessionId":"<session-id>","contextMap":{}}' --json` after the explorer pre-planner gate.
6. `pi workflow ralplan write-artifact --input '{"sessionId":"<session-id>","stage":"planner","stageN":1,"artifact":"# Plan..."}' --json` for planner, architect, critic, revision, expert-stage, adr, and final artifacts.
7. Stop for explicit user approval when a pending-approval plan exists.
8. `pi workflow ralplan approve-plan --input '{"sessionId":"<session-id>","approved":true,"target":"ultragoal"}' --json` only after explicit approval/rejection.

Always pass the current session id as `sessionId` in action payloads. Role agents must persist artifacts through workflow commands and return receipt-only summaries.
