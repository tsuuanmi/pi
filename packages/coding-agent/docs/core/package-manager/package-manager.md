# Package Manager

Pi package management for discovering, installing, and resolving extensions, skills, prompts, and themes from npm and git sources.

## Overview

Pi packages bundle distributable content (extensions, skills, prompts, themes, agents) that can be installed from npm or git repositories. The package manager handles resolution, installation, updates, and resource discovery.

## Package Format

A pi package is a standard npm package with a `pi` field in `package.json`:

```json
{
  "name": "@my-org/pi-my-tools",
  "pi": {
    "extensions": ["./src/extension.ts"],
    "skills": ["./skills/"],
    "prompts": ["./prompts/"],
    "themes": ["./themes/"],
    "agents": ["./agents/"]
  }
}
```

The `pi` field defines which resources the package provides. Each entry can be a single file or a directory glob pattern.

## Package Sources

Packages can come from npm or git:

| Source Type | Format | Example |
|-------------|--------|---------|
| npm | `package-name` or `package-name@version` | `pi-skills`, `@org/my-ext@1.2.0` |
| npm (scoped) | `@scope/package` | `@tsuuanmi/pi-skills` |
| git | Git URL or `git+` prefix | `https://github.com/user/repo.git`, `git+https://...` |
| local | File path | `./my-extension/` |

### Filtered Packages

Packages can be filtered to load only specific resource types:

```json
{
  "packages": [
    {
      "source": "pi-skills",
      "skills": ["brave-search", "transcribe"],
      "extensions": [],
      "prompts": [],
      "themes": [],
      "agents": []
    }
  ]
}
```

## PathMetadata

Every resolved resource carries metadata identifying its origin:

```typescript
interface PathMetadata {
  source: string;              // Source identifier (e.g., "npm:pi-skills", "git:https://...")
  scope: SourceScope;         // "user" | "project" | "temporary"
  origin: "package" | "top-level";
  baseDir?: string;           // Base directory for relative path resolution
}
```

## ResolvedPaths

The package manager resolves all configured resources into structured paths:

```typescript
interface ResolvedPaths {
  extensions: ResolvedResource[];
  skills: ResolvedResource[];
  prompts: ResolvedResource[];
  themes: ResolvedResource[];
  commands: ResolvedResource[];
  agents: ResolvedResource[];
}

interface ResolvedResource {
  path: string;          // Absolute path to the resource
  enabled: boolean;      // Whether the resource is active
  metadata: PathMetadata; // Source tracking info
}
```

## PackageManager Interface

```typescript
interface PackageManager {
  resolve(onMissing?): Promise<ResolvedPaths>;
  install(source: string, options?): Promise<void>;
  installAndPersist(source: string, options?): Promise<void>;
  remove(source: string, options?): Promise<void>;
  removeAndPersist(source: string, options?): Promise<boolean>;
  update(source?: string): Promise<void>;
  listConfiguredPackages(): ConfiguredPackage[];
  resolveExtensionSources(sources: string[], options?): Promise<ResolvedPaths>;
  addSourceToSettings(source: string, options?): boolean;
  removeSourceFromSettings(source: string, options?): boolean;
  setProgressCallback(callback?: ProgressCallback): void;
  getInstalledPath(source: string, scope): string | undefined;
}
```

### Methods

| Method | Description |
|--------|-------------|
| `resolve()` | Resolve all configured packages and local resources into `ResolvedPaths` |
| `install()` | Install a package to the local cache |
| `installAndPersist()` | Install and add to settings |
| `remove()` | Remove a package from the local cache |
| `removeAndPersist()` | Remove from cache and settings |
| `update()` | Update one or all packages |
| `listConfiguredPackages()` | List all configured packages with their status |
| `addSourceToSettings()` | Add a source to project or user settings |
| `removeSourceFromSettings()` | Remove a source from settings |

### Progress Callback

Install/update operations report progress via callback:

```typescript
interface ProgressEvent {
  type: "start" | "progress" | "complete" | "error";
  action: "install" | "remove" | "update" | "clone" | "pull";
  source: string;
  message?: string;
}
```

## Installation Paths

| Scope | npm install path | git install path |
|-------|-------------------|-----------------|
| User | `~/.pi/agent/npm/` | `~/.pi/agent/git/` |
| Project | `.pi/npm/` | `.pi/git/` |

The `npmCommand` setting can override the npm binary used for installations:

```json
{
  "npmCommand": ["mise", "exec", "node@20", "--", "npm"]
}
```

## Offline Mode

Set `PI_OFFLINE=1` to disable all startup network operations, including package update checks and npm registry lookups.

## See Also

- [Pi Packages](../../packages.md) - Full package management documentation
- [Extensions](../extensions/extensions.md) - Extension development
- [Settings](../settings/settings.md) - Package configuration