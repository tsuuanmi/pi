# Subagents

`src/harness/subagents/*` exposes lower-layer subagent contracts used by workflow packages and host implementations. The package does not implement a full subagent runner here; it defines the shared types, factory registry, progress tracking, and yield-result extraction.

## Manager contract

```typescript
interface SubagentManager {
  spawn(request: SubagentRunRequest): Promise<SubagentRunResult>;
  resume(id: string, message: string, options: Pick<SubagentRunRequest, "agent" | "systemPrompt" | "tools" | "excludeTools" | "model" | "thinkingLevel" | "signal" | "storageSessionId">): Promise<SubagentResumeResult>;
  steer(id: string, message: string, delivery: "steer" | "followUp", sessionId: string): Promise<SubagentResumeResult>;
  pause(id: string, sessionId: string): Promise<{ ok: boolean; reason?: string; record?: SubagentRecord }>;
  cancel(id: string, sessionId: string): Promise<SubagentRecord | undefined>;
  read(id: string, sessionId: string): Promise<SubagentRecord | undefined>;
  list(sessionId: string): Promise<SubagentRecord[]>;
  waitFor(id: string, options: SubagentAwaitOptions): Promise<SubagentAwaitResult>;
  dispose(): Promise<void>;
}
```

## Durable record and run types

- `SubagentStatus`: `queued`, `running`, `paused`, `completed`, `failed`, `cancelled`.
- `SubagentDelivery`: `steer` or `followUp`.
- `SubagentResumeFailureReason`: `context_unavailable`, `not_found`, `no_runner`, `resume_failed`.
- `SubagentRecord`: durable metadata, status, session ids/files, timestamps, result/error text, and optional structured `yield_result`.
- `SubagentRunRequest`: spawn options including profile, role, prompt, system prompt, cwd, tool filters, model, thinking level, persistence, detached mode, labels, parent/storage session ids, signal, and resume session file.
- `SubagentRunResult`: final record, messages, and text output.
- `SubagentAwaitResult`: success with a run result, or `not_found`/`timeout` with optional record and retained progress.
- `SubagentResumeResult`: success with a run result, or one of the resume failure reasons with optional record.

## Factory registry

```typescript
registerSubagentManagerFactory(factory);
const factory = getSubagentManagerFactory();
clearSubagentManagerFactoryForTests();
```

`SubagentManagerFactoryContext` includes `cwd`, optional `agentDir`, extension flag values, resource-loader options, and an owner lifecycle abort signal. Host packages register a factory; workflow/runtime packages look it up without depending on the host implementation.

## Progress tracking

`SubagentProgressTracker` retains last-known progress snapshots for running or recently terminal subagents. Snapshots include current tool, truncated current args, recent tools, recent assistant output, tool/turn counts, update timestamp, and duration.

Key methods:

- `startTracking(id, subscribe)` subscribes to an event stream and initializes a snapshot.
- `markTerminal(id, status)` records terminal status and unsubscribes.
- `stopTracking(id)` unsubscribes while retaining the snapshot.
- `getProgress(id)` returns the retained snapshot.
- `clear(id)` and `clearAll()` remove retained state.
- `renderSubagentProgress(progress)` formats a human-readable diagnostic string.

## Yield results

```typescript
interface YieldDetails {
  data: unknown;
  status: "success" | "aborted";
  error?: string;
}

extractYieldFromMessages(messages);
```

`extractYieldFromMessages()` walks messages from newest to oldest and returns the details from the most recent `toolResult` whose `toolName` is `yield`.
