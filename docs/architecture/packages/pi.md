# `@tsuuanmi/pi`

[Package README](../../../packages/pi/README.md) | [Documentation](../../../packages/pi/docs/index.md) | [Application flow](../../../packages/pi/docs/app/index.md) | [SDK reference](../../../packages/pi/docs/api/sdk.md) | [Public barrel](../../../packages/pi/src/index.ts) | [Workspace overview](../package-overview.md) | [Integration map](../component-integration-map.md) | [Overlap audit](../package-overlap-audit.md)

## Role

`@tsuuanmi/pi` is the workspace composition root. It is simultaneously the `pi` CLI, an embeddable SDK, the application/session host, the package and extension host, the interactive terminal application, and the concrete runtime for coding tools and Pi-native subagents.

No workspace package imports Pi. Lower layers expose contracts; Pi supplies concrete policy, resources, storage, UI, and process integration.

## Boundary

**Owns**

- CLI bootstrap, argument parsing, startup commands, session selection, mode resolution, and process-level setup.
- Cwd-bound settings, auth storage, model registry, package/resource discovery, extension loading, and runtime composition.
- `AgentSession`, session replacement, prompt flow, retries, compaction, context optimization, API usage logging, and resource reload.
- Append-only session history, branching, resume/continue behavior, and session metadata.
- Built-in read/bash/edit/write/LSP and related coding tools, process execution, output sanitation, and truncation.
- Interactive TUI composition plus print, JSON, and stdio RPC modes.
- Extension contracts, lifecycle, hooks, commands, tools, custom providers, and UI context.
- Concrete subagent persistence, isolated sessions, worker lifecycle, and optional tmux execution.

**Does not own**

- Provider-neutral model and stream protocols; AI owns them.
- The generic agent loop and reusable tool/subagent contracts; Agent owns them.
- Generic task/team scheduling, routing, retries, or checkpoint contracts; Orchestrator owns them and is reached through Workflows.
- Workflow phases, gates, artifacts, and handoff policy; Workflows owns them.
- Terminal rendering primitives; TUI owns them.

The `src/app/` layer itself is orchestration only. Behavior should remain in CLI, loader, settings, runtime, session, modes, tools, or another owning boundary.

## Public entry points

| Entry | Surface |
|---|---|
| `pi` binary | [`src/cli/cli.ts`](../../../packages/pi/src/cli/cli.ts) process entry and [`src/main.ts`](../../../packages/pi/src/main.ts) application startup |
| `@tsuuanmi/pi` | Broad SDK barrel: `main`, session/runtime factories, `AgentSession`, settings/package helpers, tools, subagents, compaction, modes, and selected TUI APIs |
| `@tsuuanmi/pi/extensions` | Supported extension contracts and helper types; private extension loader/runner internals are excluded |
| `@tsuuanmi/pi/loader` | `ModelRegistry` and provider-loading types |
| `@tsuuanmi/pi/loader/config` | Loader configuration contracts |

`#pi/*` aliases are internal. External extensions should use the documented `@tsuuanmi/pi/extensions` surface rather than source or `dist` deep imports.

## Components

| Component | Source | Responsibility |
|---|---|---|
| CLI/bootstrap | [`src/cli/`](../../../packages/pi/src/cli), [`src/main.ts`](../../../packages/pi/src/main.ts) | Process setup, arguments, startup commands, session selection, diagnostics, and mode dispatch |
| App orchestration | [`src/app/`](../../../packages/pi/src/app) | Orders startup and creates/replaces the runtime without owning lower-level implementations |
| Runtime services | [`src/runtime/agent-session-services.ts`](../../../packages/pi/src/runtime/agent-session-services.ts) | Coherent cwd-bound settings, auth, resources, model registry, extensions, and session infrastructure |
| Runtime owner | [`src/runtime/agent-session-runtime.ts`](../../../packages/pi/src/runtime/agent-session-runtime.ts) | Owns the current services/session and safe teardown/recreation |
| Session factory | [`src/runtime/agent-session-factory.ts`](../../../packages/pi/src/runtime/agent-session-factory.ts) | Builds Agent, stream/auth callbacks, tools, context transforms, and persistence integration |
| AgentSession | [`src/runtime/agent-session.ts`](../../../packages/pi/src/runtime/agent-session.ts) | Pi-specific session API and coordination across prompts, models, tools, extensions, retries, and compaction |
| Resource loader | [`src/loader/resources.ts`](../../../packages/pi/src/loader/resources.ts) | Resolves packages, extensions, skills, prompts, themes, context, and agents |
| Extensions | [`src/loader/extensions/`](../../../packages/pi/src/loader/extensions), [`src/runtime/extensions/`](../../../packages/pi/src/runtime/extensions) | Public contracts, module loading, activation, event dispatch, dynamic registration, and invalidation |
| Settings/auth/models | [`src/settings/`](../../../packages/pi/src/settings), [`src/auth/`](../../../packages/pi/src/auth), [`src/loader/model-registry.ts`](../../../packages/pi/src/loader/model-registry.ts) | Merged configuration, credential/account storage, model availability, and provider registration |
| Session persistence | [`src/session/`](../../../packages/pi/src/session) | Append-only JSONL session tree, reconstruction, branching, metadata, and storage paths |
| Modes/UI | [`src/modes/`](../../../packages/pi/src/modes), [`src/ui/`](../../../packages/pi/src/ui) | Interactive, print/JSON, RPC behavior and Pi-specific TUI components/controllers |
| Tools/execution | [`src/tools/`](../../../packages/pi/src/tools), [`src/execution/`](../../../packages/pi/src/execution) | Concrete coding tools, Bash/program adapters, policy, buffering, sanitation, and truncation |
| Subagents | [`src/subagents/`](../../../packages/pi/src/subagents) | Concrete `SubagentManager`, records, worker/session creation, native/tmux execution, and runtime identity |
| Package manager | [`src/package/`](../../../packages/pi/src/package) | Package sources, install/update/remove/config behavior, and bundled package resolution |

## Startup flow

```text
src/cli/cli.ts
  -> process identity, PI environment, warnings, HTTP dispatcher
  -> src/main.ts / bootstrapStartup()
  -> pre-session package and workflow commands
  -> parse arguments and resolve output mode
  -> select/create/resume SessionManager and effective cwd
  -> create AgentSessionServices for that cwd
  -> load settings, packages, resources, extensions, models, and auth
  -> create AgentSessionRuntime and AgentSession
  -> prepare input and theme
  -> dispatch interactive, print/JSON, or RPC mode
```

Session selection occurs before cwd-bound resources are created because a resumed session can belong to a different project. Session replacement shuts down the old extension/runtime context, disposes the session, creates services for the new cwd, and rebinds host UI.

## Prompt and event flow

```text
User / extension / RPC input
  -> extension input hooks
  -> prompt and skill expansion
  -> AgentSession.prompt()
  -> @tsuuanmi/pi-agent Agent.prompt()
  -> context hooks and optimizer
  -> credential/model stream callback
  -> @tsuuanmi/pi-ai provider stream
  -> Agent events and tool calls
  -> Pi concrete tool execution
  -> session JSONL + extension events + mode output
```

AgentSession is the high-coupling integration point. Agent still owns turn control; Pi bridges Agent events into persistent session records, extension events, compaction/retry controllers, telemetry, and UI/RPC consumers.

## Workspace dependencies

| Dependency | Contract used |
|---|---|
| `@tsuuanmi/pi-ai` | Models, providers, OAuth, normalized streams/events, usage, schema validation, and custom-provider registration |
| `@tsuuanmi/pi-agent` | Agent loop, tools, events/hooks, messages, receipts, compaction helpers, subagent contracts, and Node execution helpers |
| `@tsuuanmi/pi-tui` | Terminal runtime, components, editor/input, themes, overlays, status/HUD, and render utilities |
| `@tsuuanmi/pi-workflows` | Bundled extension/skills/commands, workflow active state, and shared session-root primitives |

Pi has no direct dependency on `@tsuuanmi/pi-orchestrator`. Workflows owns that integration.

## External dependency groups

| Group | Dependencies | Purpose |
|---|---|---|
| Terminal/data rendering | `chalk`, `diff`, `typebox`, `yaml` | Styling, diffing, schemas, and configuration parsing |
| Discovery and package management | `glob`, `minimatch`, `ignore`, `hosted-git-info`, `semver`, `jiti` | Resource matching, ignore rules, package sources/versions, and TypeScript extension loading |
| Persistence safety | `proper-lockfile` | Cross-process locking for auth and settings storage |
| Networking | `undici` | HTTP dispatcher, proxy, and network integration |
| Code intelligence | `pyright`, `typescript`, `typescript-language-server` | Built-in language-server and analysis capabilities |

These are production dependencies because the published CLI exposes the corresponding built-in capabilities.

## Resource and package interaction

```text
Global/project settings + built-in defaults
  -> package source resolution
  -> package manifests and pi resource declarations
  -> DefaultResourceLoader
  -> extensions, skills, prompts, themes, agents, commands, context
  -> diagnostics + runtime registries
  -> AgentSession
```

Pi ships `pi:workflows` as a bundled default package source. During `packages/pi` build, compiled Workflows assets are copied into `dist/packages/` for the distribution layout. Pi loads the package-owned workflow extension factory through `ExtensionAPI` and dispatches its CLI handler directly; package resource discovery supplies the workflow skills and role profiles.

Resource loading can report partial diagnostics; not every bad optional resource aborts all startup. Extension code is executable code and runs with the Pi process's user permissions.

## Subagent interaction

Pi implements the structural `SubagentManager` from Agent:

```text
subagent tool / workflow adapter
  -> Pi SubagentManager
  -> durable record and run identity
  -> isolated resource loader and extension runtime
  -> isolated AgentSession
  -> native in-process or tmux-backed worker
  -> status, result, receipt, and saved context
```

Subagents share resolved auth/model/settings inputs as designed but receive isolated session and extension runtime state. Nested subagents are disabled. Workflows must use this injected manager rather than constructing another one.

## Persistence boundaries

| Data | Owner/location |
|---|---|
| Global/project settings | Pi settings storage |
| API/OAuth account records | Pi auth storage |
| Conversation history and extension session state | Pi append-only session JSONL |
| Subagent records, run identity, and isolated logs | Pi subagent/session storage |
| Workflow state, artifacts, audit, and receipts | Workflows under the explicit Pi session root |
| Orchestrator checkpoints used by workflows | Workflows-provided checkpoint store |

Persisted provider history remains raw. Context optimization affects provider-bound replay, not the canonical session transcript or extension context events.

## Extension points

- `createAgentSession()` and service/runtime factories for SDK embedding.
- `ResourceLoader` and `ModelRegistry` injection.
- Extension factories and documented extension events, commands, tools, providers, context hooks, renderers, and UI APIs.
- Package manifest resource fields for extensions, skills, prompts, themes, agents, commands, and context.
- Custom tools and Bash/process operations.
- Alternate session managers and runtime options documented by the SDK.

## Runtime constraints and security

- ESM; Node.js 22.19 or newer; published for Linux and macOS.
- CLI startup mutates process-global state such as environment flags, HTTP dispatch, proxy handling, title, warnings, and stdout behavior.
- Pi has no built-in filesystem/process/network/credential sandbox. Extensions and project-local code execute with the invoking user's permissions.
- Extension contexts become stale after reload or session replacement and must not be retained as permanent session handles.
