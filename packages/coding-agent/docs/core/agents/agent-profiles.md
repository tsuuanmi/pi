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

## `LoadedAgentProfile`

A resolved profile with source tracking:

```typescript
interface LoadedAgentProfile extends AgentProfile {
  sourceInfo: AgentSourceInfo;
}

interface AgentSourceInfo {
  path: string;                    // Absolute path to the profile file
  providerId: string;              // "agents-markdown" or "package-agents"
  providerDisplayName: string;     // Human-readable provider name
  level: AgentSourceLevel;         // Source level
  scopeRoot?: string;             // Root directory for the scope
  format: AgentProfileFormat;      // "markdown" or "bundled"
}
```

## `AgentProfileLoadResult`

```typescript
interface AgentProfileLoadResult {
  profiles: LoadedAgentProfile[];
  diagnostics: ResourceDiagnostic[];
}
```

## `loadAgentProfiles()`

```typescript
import { loadAgentProfiles } from "@tsuuanmi/pi-coding-agent";

const { profiles, diagnostics } = loadAgentProfiles({
  cwd: process.cwd(),
  agentDir: path.join(homedir(), ".pi", "agent"),
  settingsManager,
});
```

Loads agent profiles from:
1. Project directories (`.agent/agents/` and `.agents/agents/` in project ancestors)
2. User directory (`~/.agent/agents/` and `~/.agents/agents/`)
3. Package-provided profiles

Returns `AgentProfileLoadResult` with loaded profiles and any diagnostics.

### `loadAgentProfile()`

```typescript
import { loadAgentProfile } from "@tsuuanmi/pi-coding-agent";

const profile = await loadAgentProfile(
  { cwd: process.cwd(), agentDir, settingsManager },
  "reviewer",
);
```

Convenience function that loads all profiles and finds one by name. Returns `undefined` if not found.

## `loadAgentDefinitions()`

The core loading function that scans directories, parses frontmatter, and deduplicates profiles:

```typescript
const result = loadAgentDefinitions({
  cwd: process.cwd(),
  agentDir: path.join(homedir(), ".pi", "agent"),
  packageAgentPaths: resolvedPaths.agents.map(r => r.path),
});
```

### Search Order

Agent directories are searched in project ancestors (walking up to the git root or filesystem root), then user-level directories:

1. `<project-ancestor>/.agent/agents/*.md` (project, each ancestor)
2. `<project-ancestor>/.agents/agents/*.md` (project, each ancestor)
3. `~/.agent/agents/*.md` (user)
4. `~/.agents/agents/*.md` (user)
5. Package-provided paths (package)

### Duplicate Resolution

When multiple profiles share the same name, the first-loaded profile wins. Collisions are reported as `ResourceDiagnostic` with `type: "collision"` and a `ResourceCollision` detail identifying the winner and loser paths.

## Profile File Format

Profiles are Markdown files with YAML frontmatter:

```markdown
---
name: reviewer
description: Code review specialist
model: claude-4-sonnet
thinkingLevel: high
tools: ["read", "bash", "grep"]
excludeTools: ["write", "edit"]
persistent: true
appendSystemPrompt: "Focus on security issues."
---

You are a code reviewer. Focus on correctness, readability, and security.
```

The body content after frontmatter is appended to `systemPrompt`.

### Frontmatter Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | yes | Unique profile name |
| `description` | string | yes | Human-readable description |
| `model` | string | no | Provider/model override |
| `thinkingLevel` | string | no | Thinking level: `off`, `minimal`, `low`, `medium`, `high` |
| `tools` | string[] or string | no | Allowed tool names (comma-separated string or array) |
| `excludeTools` | string[] or string | no | Tool names to exclude (comma-separated string or array) |
| `systemPrompt` | string | no | System prompt override |
| `appendSystemPrompt` | string | no | Additional system instructions appended after the default prompt |
| `persistent` | boolean | no | Whether the session should persist to disk |

`model` and `thinkingLevel` are profile defaults. Interactive `/settings` → Model & thinking → Roles can set `agentModels` and `agentThinkingLevels` overrides per agent role, which take precedence over profile frontmatter without editing the profile file.

### Frontmatter Aliases

- `thinking-level` is an alias for `thinkingLevel`
- `thinking` is also accepted as an alias for `thinkingLevel`

### Reserved Fields

The following fields are parsed but reserved for future phases:

| Field | Status |
|-------|--------|
| `forkContext` | Reserved — not enforced |
| `bashAllowedPrefixes` | Reserved — not enforced |
| `spawns` | Reserved — not enforced |
| `output` | Ignored in Phase 1A |
| `autoloadSkills` | Ignored in Phase 1A |
| `blocking` | Ignored in Phase 1A |
| `hide` | Ignored in Phase 1A |

Unknown fields produce a `warning` diagnostic.

### Validation Errors

| Error | Condition |
|-------|-----------|
| `name is required` | Missing or empty name |
| `description is required` | Missing or empty description |
| `thinkingLevel must be one of...` | Invalid thinking level value |
| `model arrays are not supported` | Model specified as array |
| Reserved field used | `forkContext`, `bashAllowedPrefixes`, or `spawns` present |

## Agent Source Levels

| Level | Description |
|-------|-------------|
| `"bundled"` | Built-in agent profiles |
| `"user"` | `~/.agent/agents/` or `~/.agents/agents/` |
| `"project"` | `<project>/.agent/agents/` or `<project>/.agents/agents/` |
| `"package"` | Installed pi package agents |
| `"temporary"` | Runtime-only profiles |

## See Also

- [Settings](../settings/settings.md) - Configuration system
- [Resources](../resources/resources.md) - Resource diagnostics and collision reporting