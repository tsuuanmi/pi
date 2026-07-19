# Agent Session Runtime

Core abstraction for agent lifecycle, state management, and session persistence.

## Overview

`AgentSession` is the central class shared between all run modes (interactive, print, JSON, RPC). It encapsulates:

- Agent state access (model, thinking level, messages)
- Event subscription with automatic session persistence
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

### SessionBeforeCompactResult

Result of pre-compaction hooks from extensions:

```typescript
interface SessionBeforeCompactResult {
  proceed: boolean;  // Whether compaction should proceed
}
```

### SessionBeforeTreeResult

Result of pre-tree-navigation hooks:

```typescript
interface SessionBeforeTreeResult {
  proceed: boolean;  // Whether navigation should proceed
}
```

## Session Services

`AgentSessionServices` provides the shared service container:

```typescript
interface AgentSessionServices {
  settingsManager: SettingsManager;
  modelRegistry: ModelRegistry;
  sessionManager: SessionManager;
  resourceLoader: ResourceLoader;
  extensionRunner?: ExtensionRunner;
}
```

These services are initialized once and shared across session instances.

## See Also

- [Sessions](../session-manager/sessions.md) - Session management and persistence
- [Compaction](../compaction/compaction.md) - Context compaction and summarization
- [Extensions](../extensions/extensions.md) - Extension lifecycle and hooks