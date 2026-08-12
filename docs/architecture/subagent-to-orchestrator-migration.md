# Subagent to Orchestrator Migration

Status: **Implemented**.

## Decision

`@tsuuanmi/pi-orchestrator` owns the complete session-aware subagent feature. `@tsuuanmi/pi` remains the application/session host and exposes generic session services to extensions, but it does not import, construct, register, dispatch, persist, or export the subagent runtime.

The dependency direction is:

```text
ai -> agent -> pi -> orchestrator -> workflows
           \-> tui -> pi
```

More precisely, `pi` depends on `ai`, `agent`, and `tui`; `orchestrator` depends on `pi`, `agent`, and `ai`; workflows depends on both. There is no `pi -> orchestrator` source or manifest edge.

## Findings from the source review

The original plan proposed moving contracts while leaving the concrete manager, store, worker, and lifecycle tools in Pi. That split was rejected during implementation because it would preserve two owners and leave the feature in Pi. The source also exposed two responsibilities that needed explicit separation:

1. Generic Pi tmux command resolution and spawn types were mixed into the subagent launcher. They now live in `packages/pi/src/cli/tmux.ts` and are published through `@tsuuanmi/pi/tmux`.
2. Extension contexts need coherent session construction inputs without knowing about subagent internals. `AgentSessionServices` is now an API-layer contract exposed as `ExtensionContext.sessionServices`.

The tmux worker could not remain a Pi startup special case without coupling Pi to orchestrator. It is now an orchestrator package command named `subagent-worker`; tmux launch plans re-invoke the Pi binary through the normal package-command dispatcher. Pi's extension loader resolves bundled package entry points generically from their compiled manifests, so bundled workflows can import orchestrator without a Pi manifest dependency.

## Implemented file changes

### Orchestrator ownership

All former `packages/pi/src/subagent/` modules moved to `packages/orchestrator/src/subagent/`:

- contracts and adapters: `context.ts`, `manager-api.ts`, `spec.ts`, `types.ts`, `stream.ts`
- lifecycle: `manager.ts`, `registry.ts`, `runtime.ts`, `lifecycle-tools.ts`, `tools.ts`, `tool-execution.ts`, `tool-names.ts`, `tool-schemas.ts`
- persistence and observations: `store.ts`, `progress.ts`, `receipts.ts`, `yield-result.ts`
- tmux execution: `tmux.ts`, `tmux-launch.ts`, `tmux-backend.ts`, `subagent-worker.ts`
- identity: `run-identity.ts`, `run-identity.schema.json`

`registry.ts` owns one manager per Pi session-service set. `runtime.ts` registers lifecycle/control tools, contributes active-subagent HUD data, and disposes the manager on `session_shutdown`.

The orchestrator package now:

- depends directly on `@tsuuanmi/pi`, `@tsuuanmi/pi-agent`, `@tsuuanmi/pi-ai`, and `typebox`;
- publishes the manager, API, contracts, registration functions, progress, receipts, and result helpers;
- declares `dist/subagent/subagent-worker.js` as a Pi package command;
- copies the run-identity schema into its own `dist/subagent/`.

Subagent source, docs, and tests now have matching `packages/orchestrator/{src,docs,test}/subagent/` layouts.

### Pi host boundary

Pi removed:

- `src/subagent/`;
- built-in subagent extension registration;
- `AgentSession.subagentManager` and service/factory manager options;
- `ExtensionContext.subagents`;
- the `--subagent-worker` startup special case;
- subagent exports and the orchestrator package dependency;
- Pi-owned run-identity asset copying;
- the subagent-specific status-line segment.

Pi added:

- `src/api/session-services.ts` for the API-layer `AgentSessionServices` contract;
- `ExtensionContext.sessionServices`;
- public `loadAgentProfile`/`AgentProfile` exports through `@tsuuanmi/pi/loader`;
- `src/cli/tmux.ts` and the `@tsuuanmi/pi/tmux` export for generic Pi/tmux host utilities.

The main `AgentSession`, session manager, resource loader, settings, auth, tools, modes, and UI remain Pi-owned.

### Workflow composition

`packages/workflows/src/extension.ts` is the product composition point:

1. `registerSubagentRuntime(host)` installs the orchestrator-owned lifecycle/control tools and shutdown handling.
2. Workflow tool registration wraps Pi's `ExtensionContext` into `WorkflowContext` and resolves the session manager through `getSubagentManager(context)`.
3. Workflow adapters import all subagent contracts from `@tsuuanmi/pi-orchestrator`.

Workflow-owned tests remain in workflows when they validate Team, Ralplan, or Ultragoal policy against an injected `SubagentManagerApi`. Subagent manager, lifecycle, receipt, progress, and tmux tests live only in orchestrator.

### Dependency enforcement and build

`scripts/check-package-boundaries.mjs` now enforces:

- `orchestrator -> pi` is allowed and declared;
- `pi -> orchestrator` is absent;
- orchestrator subagent modules cannot import Pi private aliases or workflows;
- workflows cannot import Pi private aliases.

The root build order is `ai -> agent -> tui -> pi -> orchestrator -> workflows`, followed by Pi package asset composition.

## Runtime invariants

- There is one authoritative `SubagentManager` implementation.
- Subagent records remain under the owning Pi session root: `.pi/<session-id>/state/subagent/`.
- Subagent sessions reuse coherent Pi auth/settings/model/resource configuration while receiving isolated session and extension runtime state.
- All `subagent_*` tools are excluded from child sessions, preventing nested subagent runs.
- Native execution and tmux execution use the same manager/store contracts.
- Worker dispatch uses a normal orchestrator package command; Pi has no subagent-specific command path.
- Pi never imports orchestrator or workflows source.
- Orchestrator never imports Pi private `#pi/*` modules or workflows.

## Verification

The migration is verified with:

- package builds in dependency order;
- `node scripts/check-package-boundaries.mjs`;
- `npx tsgo --noEmit`;
- `npx biome check --write --error-on-warnings .` with unrelated changes reverted if necessary;
- orchestrator subagent tests;
- full affected-package tests where shared extension/runtime behavior changed.

## Related docs

- [Package Boundaries](package-boundaries.md)
- [Package Overview](package-overview.md)
- [Orchestrator vs. Workflows](orchestrator-vs-workflows.md)
- [Package detail: pi](packages/pi.md)
- [Package detail: orchestrator](packages/orchestrator.md)
- [Package detail: workflows](packages/workflows.md)
