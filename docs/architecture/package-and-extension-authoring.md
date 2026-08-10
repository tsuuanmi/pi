# Package and Extension Authoring

This guide describes how to add reusable Pi behavior without crossing package boundaries. It summarizes the runtime contracts; use the package-local references for complete API details.

## Choose the right integration

| Need | Use | Owning boundary |
| --- | --- | --- |
| Add a tool, hook, command, shortcut, renderer, or provider registration to a Pi host | Extension | `@tsuuanmi/pi` extension API |
| Ship skills, prompts, themes, agent profiles, or multiple extensions | Pi package | Package manifest and resource loader |
| Add workflow tools, gates, artifacts, or team/plan skills | Workflow package contribution | `@tsuuanmi/pi-workflows` host contracts |
| Add a normal model provider | AI provider/model integration | `@tsuuanmi/pi-ai`, or a Pi extension for host-specific auth/config |

Do not add a new package when an extension or resource package is sufficient. Do not put Pi session or CLI behavior into reusable lower-level packages.

## Package manifest

A package declares Pi resources in `package.json` under `pi`:

```json
{
  "name": "@example/pi-tools",
  "keywords": ["pi-package"],
  "pi": {
    "extensions": ["src/extensions/*.ts"],
    "skills": ["src/skills/**/SKILL.md"],
    "prompts": ["src/prompts/*.md"],
    "themes": ["src/themes/*.json"],
    "commands": ["src/commands/*.{ts,js,mjs,cjs}"],
    "agents": ["src/agents/*.md"]
  }
}
```

Manifest paths are relative to the package root. Entries may be files, directories, glob patterns, or exclusions. Use a manifest when the package has a non-standard layout or needs explicit resource selection.

A published package must point at files included in its tarball. If source manifests use `src/*.ts`, the package build must generate a publishable manifest with compiled paths. The producer package owns that compiled layout; Pi's loader or bundle step should not rewrite another package's resource architecture.

### Supported resource types

| Manifest key | Accepted files | Runtime role |
| --- | --- | --- |
| `extensions` | `.ts`, `.js` | Extension factories loaded into the host |
| `skills` | `.md` | Prompt-invoked skill instructions |
| `prompts` | `.md` | Prompt templates |
| `themes` | `.json` | TUI themes |
| `commands` | `.ts`, `.js`, `.mjs`, `.cjs` | Package commands handled before session startup |
| `agents` | `.md` | Reusable agent profiles |

If a package has no `pi` manifest, Pi conventionally discovers `extensions/`, `skills/`, `prompts/`, `themes/`, `commands/`, and `agents/` directories.

Resource filters in user or project settings can narrow a package's resources. Omitting a filter key loads the package's declared resources; an empty filter disables that resource type.

## Extension contract

An extension module exports an `ExtensionFactory`. Import public contracts from the extension subpath, not private `#pi/*` modules:

```ts
import type { ExtensionAPI } from "@tsuuanmi/pi/extensions";

export default function register(pi: ExtensionAPI): void {
  pi.registerCommand("hello", {
    description: "Say hello",
    handler: async (_args, ctx) => {
      ctx.ui.notify("Hello", "info");
    },
  });
}
```

The host API can register or manage:

- tools and active-tool selection;
- commands, shortcuts, and flags;
- hooks and event subscriptions;
- custom message renderers and session entries;
- model/provider registrations; and
- session messages, labels, compaction, and execution helpers.

An extension should use these APIs instead of reaching into session, loader, TUI, or provider implementation modules. Extension contexts are session-bound: stop using a context after reload, session switching, or shutdown, and use the supplied replacement context.

The public extension contracts are exported from [`@tsuuanmi/pi/extensions`](../../packages/pi/src/loader/extensions/index.ts). The loader creates one runtime registration per discovered extension and reports load errors as resource diagnostics.

## Workflow package boundary

`@tsuuanmi/pi-workflows` is a host-neutral extension package. Its extension registers workflow tools and hooks through `WorkflowHost`; Pi provides the host implementation when the package is loaded.

Workflow code may depend on:

- `@tsuuanmi/pi-agent` for generic Agent, tool, model, and thinking contracts;
- `@tsuuanmi/pi-orchestrator` for generic task/team coordination;
- `@tsuuanmi/pi-ai` for AI protocol types; and
- `@tsuuanmi/pi-tui` for workflow presentation primitives.

Workflow code may import published `@tsuuanmi/pi` APIs for session and subagent capabilities, but must not import Pi private aliases or internal source paths. Concrete session construction, persistence, authentication, and host service composition remain Pi-owned.

## Dependencies and package boundaries

- Put runtime third-party dependencies in `dependencies`.
- Import Pi public packages through their published exports. Do not import source aliases such as `#pi/*`, `#agent/*`, or `#workflows/*` from an external package.
- For packages that consume host-provided Pi libraries, use the repository's peer-dependency and bundling policy rather than shipping a second copy of the host runtime.
- If a package ships another Pi package inside its tarball, declare the dependency and bundling explicitly and reference the bundled package's resources through its package path.
- Keep source dependency direction acyclic: workflows may consume Pi's published host APIs, while Pi source does not import workflows; generic layers continue downward through orchestrator -> agent -> AI. TUI remains an infrastructure leaf.

The package graph and ownership rules are documented in [Package Overview](./package-overview.md), [Component Integration Map](./component-integration-map.md), and [Package Boundaries](./package-boundaries.md).

## Build and verification checklist

Before publishing or loading a package:

1. Build the package so every manifest path points at a shipped file.
2. Confirm `package.json` `files` includes compiled code and required markdown/JSON assets.
3. Verify extension and provider modules use public package exports.
4. Load the package from a local path or package manager source and inspect resource diagnostics.
5. Test both enabled and filtered resource configurations.
6. Review extension, skill, and provider code as executable content; installed packages run with the user's local permissions.
7. For repository package changes, run the affected package build/tests and the package-boundary check.

## Detailed references

- [Pi Packages](../../packages/pi/docs/package/packages.md) - installation, package sources, filters, and dependency handling.
- [Extensions](../../packages/pi/docs/extensions/index.md) - extension API, hooks, lifecycle, and context rules.
- [Resource Loader](../../packages/pi/docs/loader/index.md) - discovery and resolution behavior.
- [Package Overview](./package-overview.md) - all package boundaries and interactions.
- [Component Integration Map](./component-integration-map.md) - exact static-import, runtime-load, injection, data-handoff, and bundling seams.
- [Package Overlap Audit](./package-overlap-audit.md) - duplicate/ambiguous ownership and cleanup decisions.
