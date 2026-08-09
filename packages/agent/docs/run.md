# Agent Run Contracts

`src/run.ts` defines runtime request/result contracts and the public option/result types used by `Agent.run()` and task orchestration.

- `AgentRunOptions`: optional abort signal and metadata for an isolated run.
- `AgentRunResult`: success flag, output text, optional structured output, and optional error payload.
- `RunRequest`: prompt and continuation requests accepted by runtime backends.
- `RunResult`: aggregated messages, output, backend metadata, tool calls, warnings, traces, and completion status.

## Isolation

`Agent.run()` creates an isolated Agent state, executes the same internal model/tool loop as `prompt()`, and returns the final result without changing the persistent transcript.

The isolated execution receives a snapshot of the current Agent configuration and hook registrations. This means host and policy hooks continue to apply to the task run. Event subscriptions are attached to the Agent instance and are not copied into the isolated Agent. Register observers on the execution owner when event delivery is required.

`beforeRun` and `afterRun` hooks surround this isolated `run()` lifecycle. They are not general lifecycle callbacks for persistent `prompt()` or `continue()` calls. Tool and next-turn hooks continue to operate inside the loop.

## Orchestrator boundary

`@tsuuanmi/pi-orchestrator` should consume `Agent.run()` for task-oriented execution and own task-level concerns such as routing, retries, verification, checkpoints, and task events. It should register an existing Agent hook only when it needs an Agent lifecycle policy; task-specific hooks and events remain orchestrator contracts.

`Agent.run()` is single-flight per Agent instance. Use separate configured Agent instances when independent task runs must proceed concurrently.
