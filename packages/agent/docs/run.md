# Agent Run Contracts

`src/run.ts` defines runtime request/result contracts and the public option/result types used by `Agent.run()` and task orchestration.

- `AgentRunOptions`: optional abort signal and metadata for an isolated run.
- `AgentRunResult`: success flag, output text, optional structured output, and optional error payload.
- `RunRequest`: prompt and continuation requests accepted by runtime backends.
- `RunResult`: aggregated messages, output, backend metadata, tool calls, warnings, traces, and completion status.
