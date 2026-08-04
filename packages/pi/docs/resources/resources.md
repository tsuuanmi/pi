# Resources

Resource loading, diagnostic reporting, and source tracking for extensions, skills, prompts, themes, package commands, and agents.

## Overview

The resource loader provides a unified system for loading and validating resources from package and top-level sources. Package source resolution is owned by `package-manager/loader.ts`; general user and project discovery remains in this module. The loader tracks where resources come from and reports collisions and diagnostics.

## Resolution Boundary

Package resources are resolved from a package root using its `pi` manifest or convention directories. The package loader returns absolute resource paths and source metadata but does not parse or execute resources.

This module resolves top-level user/project resources and passes both top-level and package descriptors to the type-specific loaders. Type-specific loaders parse Markdown, JSON, and modules; the package manager never performs those operations. Extension runtime code lives under `src/extensions/`, while module loading remains under `src/loader/extensions.ts`.

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
| `extensions` | `extensions/` | TypeScript/JavaScript extension files |
| `skills` | `skills/` | Markdown skill files |
| `prompts` | `prompts/` | Markdown prompt templates |
| `themes` | `themes/` | JSON theme files |
| `commands` | `commands/` | TypeScript/JavaScript pre-session package commands |
| `agents` | `agents/` | Markdown agent profile files |

Diagnostics currently report collisions for loaded extension, skill, prompt, theme, and agent names. Package command files are discovered as resources but run before session startup rather than participating in name-collision diagnostics.

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