# Subagents

`src/subagents/*` owns the reusable subagent contract and host-neutral lifecycle tools used by higher-level packages. The package defines what an agent run is, how callers manage it, and how the standard lifecycle tool surface maps to that contract. It does not implement persistence, filesystem workers, terminal backends, tmux, or host-specific tool registration.

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
  getActiveCount(): number;
  dispose(): Promise<void>;
}
```

## Durable record and run types

- `SubagentStatus`: `queued`, `running`, `paused`, `completed`, `failed`, `cancelled`.
- `SubagentDelivery`: `steer` or `followUp`.
- `SubagentResumeFailureReason`: `context_unavailable`, `not_found`, `no_runner`, `resume_failed`.
- `SubagentRecord`: agent-run metadata, status, owner correlation id, timestamps, result/error text, and optional structured `yield_result`.
- `SubagentRunRequest`: agent-run fields including an opaque profile identifier, role, prompt, system prompt, tool filters, model, `ThinkingLevel`, persistence, detached mode, label, lifecycle signal, and owner correlation ids. The concrete manager resolves the profile identifier.
- `SubagentRunResult`: final record, messages, and text output.
- `SubagentAwaitResult`: success with a run result, or `not_found`/`timeout` with optional record and retained progress.
- `SubagentResumeResult`: success with a run result, or one of the resume failure reasons with optional record.

## Thinking levels

`parseThinkingLevel()` validates external input against the complete `ThinkingLevel` set from `@tsuuanmi/pi-ai`. Subagent callers use the returned typed value in `SubagentRunRequest`; workflow packages do not maintain a second thinking-level policy.

## Lifecycle tools

`SUBAGENT_TOOLS` exposes host-neutral definitions for `subagent_spawn`, `subagent_status`, `subagent_await`, `subagent_steer`, `subagent_pause`, `subagent_resume`, and `subagent_cancel`. Each tool receives a required `SubagentToolContext` containing a `SubagentManager` and session id.

Host packages adapt these definitions to their tool API. The adapter owns host context checks and host-specific result wrapping; the agent package has no dependency on workflow context or workflow receipts.

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
