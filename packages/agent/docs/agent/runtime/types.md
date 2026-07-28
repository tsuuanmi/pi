# Agent Runtime Types

`src/agent/runtime/types.ts` defines public run option and result types used by `Agent.run()` and task orchestration.

- `AgentRunOptions`: optional abort signal and metadata for an isolated run.
- `AgentRunResult`: success flag, output text, optional structured output, and optional error payload.
