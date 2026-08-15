# Hooks and Events Reference

This is the canonical cross-package inventory. The governing rule is in [Hook and Event Boundaries](hook-vs-event-boundaries.md).

## `@tsuuanmi/pi-agent`

### Agent events

Owner: `packages/agent/src/events.ts`

| Event | Payload summary |
| --- | --- |
| `agent_start` | Run started. |
| `agent_status` | Agent status plus optional trace. |
| `trace` | Structured Agent trace event. |
| `warning` | Agent warning. |
| `agent_end` | Final Agent messages. |
| `turn_start` | Turn started. |
| `turn_end` | Final turn message and tool results. |
| `loop_detected` | `LoopDetectionResult`. |
| `max_turns_reached` | Current and configured turn counts. |
| `structured_output` | Validation attempt status, errors, issues, and preview. |
| `message_start` | Message lifecycle start. |
| `message_update` | Streaming assistant update. |
| `message_end` | Finalized Agent message. |
| `tool_execution_start` | Tool id, name, and arguments. |
| `tool_execution_update` | Partial tool result. |
| `tool_execution_end` | Tool result, error flag, and `ToolExecutionMeta`. |

### Agent hooks

Owner: `packages/agent/src/agent/hooks.ts`

| Hook | Control behavior |
| --- | --- |
| `beforeRun` | Runs before an Agent run. |
| `afterRun` | Runs after an Agent run. |
| `beforeToolCall` | Can block a tool call. |
| `afterToolCall` | Can patch a tool result or terminate the loop. |
| `prepareNextTurn` | Can update messages, model, system prompt, or thinking level. |

Hooks are instance-scoped, ordered, and composed by the Agent hook registry.

## `@tsuuanmi/pi`

### Extension events

Owners: `packages/pi/src/hooks/events.ts` and canonical `AgentEvent`.

`ExtensionEvent` is the union of every canonical `AgentEvent` above and these Pi-owned host events:

| Event | Payload summary |
| --- | --- |
| `session_start` | Startup/reload/new/resume reason and optional previous session. |
| `session_compact` | Completed compaction entry and origin. |
| `session_shutdown` | Quit/reload/new/resume reason and optional target. |
| `session_tree` | Old/new leaf ids and optional summary. |
| `after_provider_response` | Provider status and headers. |
| `model_select` | Current/previous model and selection source. |
| `thinking_level_select` | Current/previous thinking level. |

Register with `ExtensionAPI.on(type, handler)`. Return values are ignored.

### Extension hooks

Owner: `packages/pi/src/hooks/hook-types.ts`.

| Hook | Result/control behavior |
| --- | --- |
| `resources_discover` | Adds skill, prompt, and theme paths. |
| `session_before_switch` | Can cancel session replacement. |
| `session_before_compact` | Can cancel or supply compaction. |
| `session_before_tree` | Can cancel or customize navigation summary. |
| `context` | Replaces Agent context messages. |
| `before_provider_request` | Replaces the provider payload. |
| `before_agent_start` | Adds a custom message and/or replaces the system prompt. |
| `message_end` | Replaces a finalized same-role message before observers run. |
| `user_bash` | Supplies shell operations or a complete result. |
| `input` | Continues, transforms, or handles raw input. |
| `tool_call` | Mutates input in place and/or blocks execution. |
| `tool_result` | Patches tool content, details, and/or error state. |

Register with `ExtensionAPI.onHook(type, handler)`.

### Agent tool bridge

Owner: `packages/pi/src/hooks/agent-bridge.ts`.

| Pi hook | Agent hook |
| --- | --- |
| `tool_call` | `beforeToolCall` |
| `tool_result` | `afterToolCall` |

### Session events

Owner: `packages/pi/src/runtime/session/types.ts`.

`AgentSessionEvent` contains:

- Agent events consumed by Pi modes: `agent_start`, `turn_end`, `message_start`, `message_update`, `message_end`, `tool_execution_start`, `tool_execution_update`, `tool_execution_end`, and `structured_output`;
- adapted `agent_end` with `willRetry`;
- Pi events: `queue_update`, `compaction_start`, `compaction_end`, `session_info_changed`, `thinking_level_changed`, `auto_retry_start`, and `auto_retry_end`.

The complete Agent lifecycle is available to extensions, not duplicated into this session union.

### Custom EventBus

Owner: `packages/pi/src/hooks/event-bus.ts`.

`EventBus` carries arbitrary named extension-to-extension messages. It is independent of typed Agent, session, and extension lifecycle contracts.

## `@tsuuanmi/pi-orchestrator`

Owner: `packages/orchestrator/src/types.ts`.

### Event handlers

Configured under `events` in `OrchestratorConfig` or `RunTeamOptions`:

| Key | Observation |
| --- | --- |
| `progress` | `OrchestratorEvent`. |
| `queue` | `TaskQueueEvent`. |
| `schedulingWarning` | Scheduler warning. |
| `trace` | `OrchestratorTraceEvent`. |
| `taskStart` | Task attempt started. |
| `taskComplete` | Task completed. |

`PlanOptions.events` and `ConsensusVerifierOptions.events` expose the `trace` subset.

### Decision hooks

Configured under `hooks`:

| Key | Decision |
| --- | --- |
| `verifyTask` | Accepts or rejects task output. |
| `approveConsequentialTask` | Approves consequential work. |
| `classifyTaskRetry` | Classifies a task failure. |
| `handleTaskFailure` | Chooses retry/fail/abort behavior. |
| `approveTaskDispatch` | Allows or rejects dispatch. |

## `@tsuuanmi/pi-workflows`

### Pi registration adapter

Owner: `packages/workflows/src/hooks.ts`.

The adapter accepts `Pick<ExtensionAPI, "on" | "onHook">` and registers:

- events: `session_start`, `turn_end`, `tool_execution_end`;
- hooks: `before_agent_start`, `tool_call`, `tool_result`.

It imports Pi contracts directly and owns no duplicate extension event/hook payload definitions.

### Team workflow events

Owner: `packages/workflows/src/skills/team/events.ts`.

`TeamWorkflowEvent` is a workflow-owned view mapped from `TaskQueueEvent`, covering task queued/started/completed/failed/blocked/cancelled and dependency-blocked notifications. It is a mapping for workflow persistence and UI, not a second Orchestrator queue lifecycle.

## Classification rule

- If a callback result can change execution, classify and register it as a hook.
- If it only reports state, classify and register it as an event.
- Define the contract in the package that owns the lifecycle; consumers import it or map it explicitly.
