# Resources

Resource loading, diagnostic reporting, and source tracking for extensions, skills, prompts, themes, and agents.

## Overview

The resources module provides a unified system for discovering, loading, and validating resources from multiple source locations (bundled, user, project, package). It tracks where resources come from and reports collisions and diagnostics.

## Resource Sources

| Source | Location | Scope | Priority |
|--------|----------|-------|----------|
| Bundled | Built into pi | — | Lowest |
| User | `~/.pi/agent/` | `user` | Medium |
| Project | `.pi/` | `project` | High |
| Package | npm/git package | `user` or `project` | Medium |
| Temporary | Runtime | `temporary` | Highest |

## SourceInfo

Each loaded resource carries a `SourceInfo` record identifying its origin:

```typescript
type SourceScope = "user" | "project" | "temporary";
type SourceOrigin = "package" | "top-level";

interface SourceInfo {
  path: string;       // Absolute path to the resource file
  source: string;     // Source identifier (e.g., "npm:pi-skills", "local")
  scope: SourceScope; // Where the resource is scoped
  origin: SourceOrigin; // Whether from a package or top-level
  baseDir?: string;    // Base directory for relative path resolution
}
```

### Creating SourceInfo

```typescript
// From package metadata (e.g., npm or git packages)
const info = createSourceInfo(path, metadata);

// Synthetic source info (e.g., for runtime-only resources)
const info = createSyntheticSourceInfo(path, {
  source: "runtime",
  scope: "temporary",    // default
  origin: "top-level",  // default
  baseDir: undefined,   // default
});
```

## Resource Types

Resources are categorized by type, each with its own loading and validation logic:

| Type | Directory | Description |
|------|-----------|-------------|
| `extension` | `extensions/` | TypeScript extension files |
| `skill` | `skills/` | Markdown skill files |
| `prompt` | `prompts/` | Markdown prompt templates |
| `theme` | `themes/` | TypeScript theme files |
| `agent` | `profiles/` or `agents/` | Markdown agent profile files |

## Diagnostics

Resource loading produces `ResourceDiagnostic` objects for any issues found:

```typescript
interface ResourceDiagnostic {
  type: "warning" | "error" | "collision";
  message: string;
  path?: string;
  collision?: ResourceCollision;
}
```

### Resource Collisions

When two resources of the same type claim the same name (e.g., two skills with the same command name), a collision is recorded:

```typescript
interface ResourceCollision {
  resourceType: "extension" | "skill" | "prompt" | "theme" | "agent";
  name: string;           // Colliding name (command, tool flag, etc.)
  winnerPath: string;      // Path of the winning resource
  loserPath: string;       // Path of the losing resource
  winnerSource?: string;   // E.g., "npm:foo", "git:...", "local"
  loserSource?: string;
}
```

The winner is determined by source priority (project > user > package > bundled) and specificity within the same level.

## See Also

- [Extensions](../extensions/extensions.md) - Extension resource loading and API
- [Skills](../skills/skills.md) - Skill resource loading
- [Agents](../agents/agent-profiles.md) - Agent profile loading