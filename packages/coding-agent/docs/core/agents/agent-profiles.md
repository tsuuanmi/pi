# Agent Profiles

Agent definitions and profile loading for custom agent configurations.

## `AgentProfile`

```typescript
interface AgentProfile {
  name: string;
  description?: string;
  model?: string;
  thinkingLevel?: ThinkingLevel;
  tools?: string[];
  excludeTools?: string[];
  systemPrompt?: string;
  appendSystemPrompt?: string;
  persistent?: boolean;
}
```

Each profile defines a named agent configuration that can override model, tools, system prompt, and thinking level.

## `loadAgentProfiles()`

```typescript
import { loadAgentProfiles } from "@tsuuanmi/pi-coding-agent";

const { profiles, diagnostics } = loadAgentProfiles({
  cwd: process.cwd(),
  agentDir: path.join(homedir(), ".pi", "agent"),
});
```

Loads agent profiles from:
1. Bundled default profiles
2. `~/.pi/agent/profiles/` (user-level)
3. `.pi/profiles/` (project-level)
4. Package-provided profiles

Returns `AgentProfileLoadResult` with loaded profiles and any diagnostics.

## Profile File Format

Profiles are Markdown files with frontmatter:

```markdown
---
name: reviewer
description: Code review specialist
model: claude-4-sonnet
thinkingLevel: high
tools: ["read", "bash", "grep"]
excludeTools: ["write", "edit"]
---

You are a code reviewer. Focus on correctness, readability, and security.
```

## Agent Source Levels

| Level | Description |
|-------|-------------|
| `"bundled"` | Built-in agent profiles |
| `"user"` | `~/.pi/agent/profiles/` |
| `"project"` | `.pi/profiles/` |
| `"package"` | Installed pi package profiles |
| `"temporary"` | Runtime-only profiles |

## See Also

- [Settings](../settings/settings.md) - Configuration system