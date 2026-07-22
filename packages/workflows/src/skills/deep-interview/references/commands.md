# Deep Interview workflow commands

Use these commands with `--input` JSON objects. For exact payload validation, read `../assets/schema.json` and select the schema under `x-pi-actions["<action>"]`.

Command order for agents:

1. `pi workflow state deep-interview read --session <id> --json` to inspect state.
2. `pi workflow deep-interview plan-question` before asking each single user-facing question.
3. `pi workflow deep-interview record-answer` after the user answers.
4. `pi workflow deep-interview record-scoring` after recording the answer.
5. `pi workflow deep-interview read-compact` when resuming or budgeting prompt context.
6. `pi workflow deep-interview closure-check` before final spec writing.
7. `pi workflow deep-interview restate-goal` after closure passes.
8. `pi workflow deep-interview write-spec` after the closure and restatement gates pass.

Always pass the current session id as `sessionId` in action payloads. Do not directly edit `.pi/**` workflow state.
