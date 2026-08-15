# Agent Session Runtime

Core abstraction for agent lifecycle, state management, and session persistence.

## Overview

`AgentSession` is the central class shared between all run modes (interactive, print, JSON, RPC). It encapsulates:

- Agent state access (model, thinking level, messages)
- A narrow session event stream for UI, JSON, RPC, and SDK consumers
- Model and thinking level management
- Compaction (manual and auto)
- Bash execution with local and remote operations
- Session switching and branching
- Extension lifecycle (load, reload, shutdown)
- API usage logging
- Resource loading (skills, prompts, themes, extensions, agents)

## Session Modes

| Mode | Description |
|------|-------------|
| Interactive | Full TUI with streaming output, slash commands, and tree navigation |
| Print (`-p`) | Non-interactive: process a single prompt and exit |
| JSON (`--mode json`) | Non-interactive: structured JSON output |
| RPC (`--mode rpc`) | Programmatic: bidirectional JSON-RPC over stdio |
| SDK | Embedded: programmable via the SDK API |

All modes share the same `AgentSession` core and differ only in I/O handling.

## Key Types

### ParsedSkillBlock

Parsed from user messages when a skill block is detected:

```typescript
interface ParsedSkillBlock {
  name: string;
  location: string;
  content: string;
  userMessage: string | undefined;
}
```

### SessionBeforeCompactHookResult

Result of the pre-compaction extension hook. Defined in [`src/hooks/hook-types.ts`](https://github.com/tsuuanmi/pi/blob/main/packages/pi/src/hooks/hook-types.ts):

```typescript
interface SessionBeforeCompactHookResult {
  cancel?: boolean;             // Abort the compaction
  compaction?: CompactionResult; // Provide a precomputed result instead of running compaction
}
```

### SessionBeforeTreeHookResult

Result of the pre-tree-navigation extension hook. Defined in [`src/hooks/hook-types.ts`](https://github.com/tsuuanmi/pi/blob/main/packages/pi/src/hooks/hook-types.ts):

```typescript
interface SessionBeforeTreeHookResult {
  cancel?: boolean;
  summary?: {
    summary: string;
    details?: unknown;
  };
  customInstructions?: string;  // Override custom instructions for summarization
  replaceInstructions?: boolean; // Whether customInstructions replaces the default prompt
  label?: string;               // Override label to attach to the branch summary entry
}
```

### AgentSessionEvent

`AgentSessionEvent` is a host-facing composition, not a copy of every `AgentEvent`. It includes the Agent events consumed by Pi modes (`agent_start`, `turn_end`, message and tool execution updates, `structured_output`), a Pi-adapted `agent_end` with `willRetry`, and Pi-owned queue, compaction, retry, session-info, and thinking-level events. Extensions receive the complete canonical `AgentEvent` stream separately through `ExtensionAPI.on(...)`.

## Session Services

`AgentSessionServices` is the cwd-bound runtime service container for one effective session cwd. It is created separately from the `AgentSession` itself so session options can be resolved against these services first. The contract is defined in [`src/api/session-services.ts`](https://github.com/tsuuanmi/pi/blob/main/packages/pi/src/api/session-services.ts), and the factory is implemented in `src/runtime/agent-session-services.ts`:

```typescript
interface AgentSessionServices {
  cwd: string;
  agentDir: string;
  authStorage: AuthStorage;
  settingsManager: SettingsManager;
  modelRegistry: ModelRegistry;
  resourceLoader: ResourceLoader;
  diagnostics: AgentSessionRuntimeDiagnostic[];
  resourceLoaderOptions?: Omit<DefaultResourceLoaderOptions, "cwd" | "agentDir" | "settingsManager">;
  extensionFlagValues?: Map<string, boolean | string>;
}
```

Create it with `createAgentSessionServices(options)`, which returns the services plus diagnostics. The function does not create an `AgentSession` — use `createAgentSession` (from the [SDK](../api/sdk.md)) or `createAgentSessionFromServices` (re-exported from the package root) afterward. Services are initialized once per effective cwd and shared across session instances.

## See Also

- [Sessions](../session/sessions.md) - Session management and persistence
- [Compaction](../session/compaction/index.md) - Context compaction and summarization
- [Extensions](../extensions/index.md) - Extension lifecycle and hooks