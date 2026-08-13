# Subagent Stream Adapter

`src/subagent/stream.ts` adapts an injected subagent operation to the `@tsuuanmi/pi-ai` assistant event-stream contract consumed by `@tsuuanmi/pi-agent`.

`createSubagentStream(run)`:

- invokes the supplied operation with the selected model, provider context, and abort signal;
- emits start/text/done events for successful output;
- emits start/error events with `error` or `aborted` stop reasons;
- creates the zero-usage synthetic assistant message used by manager-backed Agents.

Consumers retain domain behavior. Team uses this adapter to connect its multi-task orchestrator agents to `SubagentManagerApi.spawn()`. Single-agent workflows call the generic `subagent_spawn` primitive instead of defining package-specific stream adapters.

The adapter does not own the Agent loop, workflow admission, role policy, or workflow persistence. Agent owns the loop, orchestrator owns generic execution, and each workflow owns its profile selection, prompts, state, and artifacts.
