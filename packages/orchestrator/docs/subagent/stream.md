# Subagent Stream Adapter

`src/subagent/stream.ts` adapts an injected subagent operation to the `@tsuuanmi/pi-ai` assistant event-stream contract consumed by `@tsuuanmi/pi-agent`.

`createSubagentStream(run)`:

- invokes the supplied operation with the selected model, provider context, and abort signal;
- emits start/text/done events for successful output;
- emits start/error events with `error` or `aborted` stop reasons;
- creates the zero-usage synthetic assistant message used by manager-backed Agents.

Consumers retain domain behavior. For example, Team builds a `SubagentManagerApi.spawn()` request, while Ralplan chooses spawn versus resume and persists workflow-owned records.

The adapter does not own the Agent loop, workflow admission, role policy, or workflow persistence. Agent owns the loop, Orchestrator owns subagent execution, and each workflow owns its policy and artifacts.
