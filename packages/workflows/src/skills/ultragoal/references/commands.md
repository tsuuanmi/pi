# Ultragoal workflow commands

Use these commands with JSON objects passed through `--input` or `--input-file`. Every skill action requires the canonical `sessionId`; tools obtain it from the host session context. For exact payload validation, read `../assets/schema.json` and select the schema under `x-pi-actions["<action>"]`.

Command order for agents:

1. `pi workflow state ultragoal read --session <session-id> --json` to inspect state.
2. `pi workflow ultragoal status --input '{"sessionId":"<session-id>"}' --json` to inspect goals.
3. `pi workflow ultragoal create-plan --input '{"sessionId":"<session-id>","brief":"approved goal..."}' --json` when no goal plan exists.
4. `pi workflow ultragoal start-next --input '{"sessionId":"<session-id>"}' --json` before implementation.
5. `pi workflow ultragoal checkpoint --input '{"sessionId":"<session-id>","goalId":"goal-1","status":"active","evidence":"..."}' --json` after progress or completion evidence; each checkpoint writes a state-only restore snapshot.
6. `pi workflow ultragoal restore-checkpoint --input '{"sessionId":"<session-id>"}' --json` only after later-task failure when you need to restore Ultragoal state to the latest valid checkpoint. Pass `expectedPlanHash` from `status.planHash` when available.
7. `pi workflow ultragoal record-obstacle --input '{"sessionId":"<session-id>","goalId":"goal-1","kind":"evidence_missing","title":"...","objective":"...","evidence":"...","rationale":"..."}' --json` when review creates a typed durable obstacle.
8. `pi workflow ultragoal classify-blocker --input '{"sessionId":"<session-id>","classification":"human_blocked","evidence":"..."}' --json` only for policy-classified failed/blocked work.
9. `pi workflow ultragoal guard --input '{"sessionId":"<session-id>"}' --json` when readiness or quality is uncertain.

Always pass the current session id as `sessionId` in action payloads. Complete checkpoints require the nested `qualityGate` shape from `../assets/schema.json`. Restore is state-only: it restores `.pi/<session-id>/skills/ultragoal/goals.json` and workflow state, but it never rolls back workspace files.
