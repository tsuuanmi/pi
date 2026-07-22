# Ralplan workflow commands

Use these commands with `--input` JSON objects. For exact payload validation, read `../assets/schema.json` and select the schema under `x-pi-actions["<action>"]`.

Command order for agents:

1. `pi workflow state ralplan read --session <id> --json` to inspect state.
2. `pi workflow ralplan status` to inspect the active run.
3. `pi workflow ralplan doctor` when resuming or when status looks inconsistent.
4. `pi workflow ralplan record-explorer-gate` after the explorer pre-planner gate.
5. `pi workflow ralplan write-artifact` for planner, architect, critic, revision, expert-stage, and final artifacts.
6. Stop for explicit user approval when a pending-approval plan exists.
7. `pi workflow ralplan approve-plan` only after explicit approval/rejection.

Always pass the current session id as `sessionId` in action payloads. Role agents must persist artifacts through workflow commands and return receipt-only summaries.
