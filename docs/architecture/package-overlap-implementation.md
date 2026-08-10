# Package Overlap Implementation Plan

This plan turns the findings in [Package Overlap Audit](package-overlap-audit.md) into production changes. It is intentionally phased so one package remains the canonical owner at every step and concurrent work is not overwritten.

## Implementation rules

- No fallback implementation when the canonical owner is unavailable.
- No legacy schema, alias, dual-write, compatibility export, or deprecated file.
- Move logic once, update every call site, then delete the old implementation.
- Adapters translate and delegate; they do not own the lower layer's state machine.
- New public names are concise, layer-specific, and documented.
- Build lower packages before consumers because workspace checks use `dist`.
- A phase is complete only after scoped formatting, package builds, relevant package tests, typecheck, docs, and changelog review.

## Status

| Phase | Scope | Status |
|---|---|---|
| 1 | Shared context tool contract and manager-backed Agent stream | Implemented in current tree |
| 2 | Generic bundled package artifact discovery | Implemented; validate compiled package manifests and paths |
| 3 | Session root and session-id ownership | Implemented in the current package boundary |
| 4 | Workflow transition initialization/private alias removal | Implemented through the package manifest and public runtime entry |
| 5 | Generic HUD provider and status-line composition | Implemented; status-line refresh remains host-owned |
| 6 | TUI repository state and global keybinding state | Planned after higher-priority boundaries |

## Phase 1 - shared contracts and stream adapter

### Goal

Remove duplicated host-context tool signatures and duplicated Team/Ralplan assistant stream envelopes without moving host or skill policy into Agent.

### Files

| Action | File | Change |
|---|---|---|
| Update | `packages/agent/src/tool/tool.ts` | Add canonical `ContextToolSpec<TContext, TParameters, TDetails>` extending `ToolSpec` without changing Agent execution |
| Update | `packages/pi/src/tool/spec.ts` | Make `ExtensionToolSpec` extend `ContextToolSpec`; keep Pi render metadata |
| Update | `packages/workflows/src/tool/spec.ts` | Make `WorkflowToolSpec` extend `ContextToolSpec`; keep Workflow context and render-shell metadata |
| Create | `packages/workflows/src/orchestration/subagent-stream.ts` | Own synthetic assistant start/text/done/error events and zero-usage messages for manager-backed Agents |
| Update | `packages/workflows/src/skills/team/agent-adapter.ts` | Keep Team prompt/request construction; delegate stream envelope to `createSubagentStream()` |
| Update | `packages/workflows/src/skills/ralplan/agent-adapter.ts` | Keep spawn/resume and record persistence; delegate stream envelope and reject missing completed output |
| Create | `packages/workflows/test/orchestration/subagent-stream.test.ts` | Verify success, empty output, failure, cancellation, event ordering, and final messages |
| Create | `packages/workflows/docs/orchestration/subagent-stream.md` | Document the adapter boundary |
| Update | Agent/Workflows docs and Agent changelog | Document the public contract and source layout |

### Completion gate

- No copied context-aware execute signature remains in Pi or Workflows.
- No Team/Ralplan `createMessage`, `createErrorMessage`, or zero-usage helper remains.
- Agent package build/tests pass.
- Workflows helper, Team adapter, Team execution, and Ralplan workflow tests pass.

## Phase 2 - bundled package artifact ownership

### Goal

Each package that declares a `pi` manifest is published as a self-contained compiled artifact and is bundled by Pi without package-specific code.

### Files

| Action | File | Required end state |
|---|---|---|
| Update | `packages/workflows/package.json` | `pi` resources point to shipped `dist/` files; `files` contains the compiled artifact and required assets |
| Update | `packages/workflows/scripts/copy-assets.mjs` | Workflow-owned assets are copied into the package's compiled layout |
| Update | `packages/pi/scripts/copy-assets.mjs` | Discover workspace packages from `package.json.pi` and copy their manifests and `dist/` trees without flattening or rewriting |
| Update | `packages/pi/src/package/bundled.ts` | Discover bundled package directories and derive `pi:<directory>` sources from compiled manifests |
| Update | `packages/pi/src/package/sources.ts` | Resolve discovered bundled sources and reject unknown `pi:` sources instead of treating them as local paths |
| Delete | `packages/pi/scripts/write-bundled-package-manifests.mjs` | Keep package-specific manifest rewriting removed |
| Update | Manifest/package tests and docs | Verify every manifest path exists in standalone and bundled layouts |

### Completion gate

- Standalone package resources all exist under published `files`.
- Pi bundles every workspace package with a valid `pi` manifest.
- Bundled packages preserve their package-relative paths.
- Bundled package runtime dependencies are present in the host dependency closure.
- No package-specific catalog, copy list, source fallback, or manifest rewrite remains in Pi.

## Phase 3 - session identity and root ownership

### Goal

Keep one path encoder/root implementation and give differently scoped validators distinct names.

### Decision

Keep the host session contract in Pi and let Workflows extend it:

- `@tsuuanmi/pi/session/root` owns `.pi` roots, path-segment encoding, and the shared `requireSessionId` precondition.
- Pi owns generated Pi session-id syntax and entry-id generation through `assertPiSessionId`.
- Workflows owns workflow-specific path builders and state below the Pi session roots.
- No duplicate encoder or ambiguous `assertSessionId` export remains.

### Files

`packages/pi/src/session/`, `packages/workflows/src/session/`, their package exports, session tests, docs, and changelogs. Agent has no session-root implementation.

## Phase 4 - transition initialization and private runtime aliases

### Goal

Every workflow tool loads its required transition/policy implementation through package-owned public runtime code; Pi does not inject `#workflows/*` aliases.

### Files

- `packages/workflows/src/extension.ts`, tool registration, runtime/skill transition modules, and root exports.
- `packages/pi/src/loader/extensions/loader.ts`.
- Package imports/exports, extension composition tests, boundary tests, and workflow command tests.

### Completion gate

- `ralplan_run_agent` works when the generic resource loader discovers the package extension and invokes its factory through Pi's `ExtensionAPI`.
- Pi contains no workflow-specific extension import or `#workflows/*` alias.
- Workflows compiled entry resolves only its own package imports/relative modules.
- Removed transitions/fallback commands have no import, export, test, doc, or asset references.

## Phase 5 - HUD ownership

### Goal

Workflows owns workflow HUD data; TUI owns normalized presentation; Pi owns provider composition and host-controlled refresh.

### Files

- TUI HUD model/render contracts.
- Workflows active-state and skill HUD producers.
- Pi extension API/runner and interactive status composition.
- Workflow hooks and HUD tests/docs.

### Required changes

- Produce canonical `HudSummary` values in Workflows.
- Register HUD readers through Pi's generic `ExtensionAPI.registerHudProvider()` feature.
- Keep status-line refresh, error isolation, ANSI, and layout in Pi/TUI.
- Do not reintroduce workflow-specific status keys, sentinel messages, or package imports in Pi.

## Phase 6 - TUI host state

### Goal

TUI renders injected state and does not own application repository processes or duplicate global/injected configuration.

### Required changes

- Move Git status acquisition/cache to Pi's footer data service; TUI receives a summary.
- Replace global keybinding lookup with host-scoped injection.
- Keep generic key matching and theme rendering in TUI; keep app actions, persistence, and discovery in Pi.

## Verification order

1. Confirm no in-repo backups and review scoped status.
2. Run Biome on touched files.
3. Build packages in dependency order: AI if changed, Agent, Orchestrator if changed, TUI if changed, Workflows, Pi.
4. Run full tests for every package whose shared/public behavior changed.
5. Run focused consumer tests for each adapter.
6. Run `npm exec -- tsgo --noEmit` from the repository root.
7. Run `npm run check:package-boundaries`.
8. Compile Pi before Workflows, build Workflows against Pi's public session contract, then run Pi's asset-copy phase and validate packed/bundled paths.
9. Run the full tests for Workflows and Pi; report unrelated pre-existing failures separately.
10. Review `git diff`, lockfile changes, generated files, docs, changelogs, and final status.

A phase with failures caused by another active workstream remains blocked; it is not completed through a fallback or by reverting that workstream.
