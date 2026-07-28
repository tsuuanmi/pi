# Orchestrator

The `Orchestrator` assigns ready tasks to agents and executes them with dependency-aware batching.

## Update logic

- Ready tasks are launched as soon as they become runnable.
- Newly unblocked tasks do not wait for unrelated long-running work to finish.
- Task snapshots carry `priority`, `role`, `memoryScope`, `dependencyPayload`, and retry settings through scheduling and execution.
- Failed or impossible dependency chains are marked blocked deterministically.
- Retryable tasks are re-run in place until `maxRetries` is exhausted.

## Scheduling strategies

- `dependency-first`: prioritize tasks that unblock the most downstream work.
- `composite`: rank by dependency criticality, capability fit, role hints, and current load.
- `capability-match`: prefer the first agent whose capabilities satisfy task requirements.
- `least-busy`: prefer the agent with the fewest active tasks.
- `round-robin`: distribute work evenly across the roster.

## Composite scheduling

Composite scheduling uses weighted scoring:

- `fit`: capability match score
- `load`: current agent load

When no agent satisfies task requirements, the orchestrator emits a warning and falls back to deterministic zero-fit assignment.

## Retry behavior

- `maxRetries` controls how many retries are allowed after the first failed attempt.
- `retryDelayMs` sets the base backoff delay.
- `retryBackoff` multiplies the delay after each failed attempt.
- `onTaskStart` fires on every attempt; `onTaskComplete` and `onTaskFail` only fire on the final outcome.

## Structured handoffs

Tasks may request dependency payload behavior with `dependencyPayload`:

- `output`: pass only the dependency output text
- `structured`: pass only structured output
- `both`: pass text and structured output

`role`, `priority`, `memoryScope`, and `verify` are included in the task prompt context. Agents can return `structured` output alongside text through `AgentRunResult` extraction. Dependent tasks receive that payload in their prompt context.

The orchestrator formats each task as a normal Agent prompt and calls `agent.run()`. Task execution is isolated from persistent Agent history and serialized per Agent instance.

## Example

```typescript
import { Agent, Orchestrator, Team } from "@tsuuanmi/pi-agent";

const orchestrator = new Orchestrator({ strategy: "composite" });
const team = new Team("builders", [
  new Agent({ name: "writer", capabilities: ["write"], initialState: { model, systemPrompt, tools }, streamFn }),
  new Agent({ name: "reviewer", capabilities: ["review"], initialState: { model, systemPrompt, tools }, streamFn }),
]);

const result = await orchestrator.run(team, [
  { id: "draft", title: "Draft", description: "Write the draft", dependencyPayload: "structured" },
  { id: "review", title: "Review", description: "Review the draft", dependsOn: ["draft"], requires: ["review"] },
]);
```
