# Deep Interview workflow commands

Use these commands with JSON objects passed through `--input` or `--input-file`. Every skill action requires the canonical `sessionId`; tools obtain it from the host session context. For exact payload validation, read `../assets/schema.json` and select the schema under `x-pi-actions["<action>"]`.

Command order for agents:

1. `pi workflow state deep-interview read --session <session-id> --json` to inspect state.
2. `pi workflow deep-interview plan-question --input '{"sessionId":"<session-id>","round":1,"questionId":"q1","questionText":"...","rationale":"..."}' --json` before asking each single user-facing question.
3. `pi workflow deep-interview record-answer --input '{"sessionId":"<session-id>","round":1,"questionId":"q1","questionText":"...","customInput":"..."}' --json` after the user answers.
4. `pi workflow deep-interview record-scoring --input '{"sessionId":"<session-id>","round":1,"questionId":"q1","scores":{"goal":0.6},"ambiguity":0.3}' --json` after recording the answer.
5. `pi workflow deep-interview closure-check --input '{"sessionId":"<session-id>"}' --json` before final spec writing.
6. `pi workflow deep-interview restate-goal --input '{"sessionId":"<session-id>","restatedGoal":"...","confirm":"Yes"}' --json` after closure passes.
7. `pi workflow deep-interview write-spec --input '{"sessionId":"<session-id>","slug":"my-spec","spec":"# Spec...","handoff":"stop"}' --json` after the closure and restatement gates pass. A `ralplan` handoff also requires an explicit `runId`.

Always pass the current session id as `sessionId` in action payloads. Do not directly edit `.pi/**` workflow state.
