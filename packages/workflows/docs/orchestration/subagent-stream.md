# Subagent Stream Adapter

`src/orchestration/subagent-stream.ts` is the single Workflows adapter from an injected subagent operation to the `@tsuuanmi/pi-ai` assistant event-stream contract consumed by `@tsuuanmi/pi-agent`.

`createSubagentStream(run)` owns only the shared stream envelope:

- invokes the supplied operation with the selected model, provider context, and abort signal;
- emits start/text/done events for successful output;
- emits start/error events with `error` or `aborted` stop reasons;
- creates the zero-usage synthetic assistant message used by manager-backed workflow Agents.

Skill adapters retain domain behavior:

- Team extracts its task prompt and constructs the Pi `SubagentManagerApi.spawn()` request.
- Ralplan chooses spawn versus resume and persists its agent record.

This module does not own the generic Agent loop, Pi subagent execution, workflow admission, role policy, or persistence. Those remain in `@tsuuanmi/pi`, Pi's concrete `SubagentManager`, and the skill-specific adapters respectively.
