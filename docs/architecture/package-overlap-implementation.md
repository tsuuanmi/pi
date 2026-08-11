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
| 6 | TUI repository state and global keybinding state | Complete; repository acquisition and active keybindings are host-scoped |
| 7 | Ultragoal obstacle transition convergence | Complete; typed obstacles are authoritative through resolution |

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

### 6A - Repository-state acquisition

**Pi ownership**

- Add a focused `RepositoryState` service under `packages/pi/src/ui/interactive/`.
- Move Git metadata discovery, branch resolution, filesystem watchers, watcher retry/debounce, porcelain execution/parsing, status polling, cache invalidation and disposal into that service.
- Keep `FooterDataProvider` focused on composing repository snapshots with extension status, provider count and account usage data.
- Delegate cwd changes and lifecycle cleanup from `FooterDataProvider` to `RepositoryState`.
- Expose one repository-change subscription so branch and status updates request a render without separate timer paths.

**TUI ownership**

- Extend `StatusLineDataProvider` with a synchronous Git status snapshot getter.
- Build segment context only from injected branch/status snapshots.
- Remove child-process imports, Git parsing/execution helpers, status cache state and Git refresh timing from `StatusLineComponent`.
- Remove the obsolete TUI Git utility module, exports, tests and documentation after their Pi replacements exist.

**State and failure rules**

- `null` means repository state is unavailable or still unresolved; zero counts represent a clean repository.
- Repository reads remain error-isolated and never throw through a render path.
- A cwd change clears stale branch/status snapshots before starting acquisition for the new directory.
- Disposal closes all watchers and timers and prevents late asynchronous results from publishing.

### 6B - Host-scoped keybindings

**TUI ownership**

- Keep generic action definitions, normalization and matching in `KeybindingsManager`.
- Pass a manager explicitly to interactive input, editor, selection, cancellation and key-hint APIs.
- Store the injected manager on the component that handles input; nested components receive the same instance.
- Remove the mutable module-level manager and the `getKeybindings()`/`setKeybindings()` exports. Do not retain a default-manager fallback or compatibility alias.

**Pi ownership**

- Create one effective `KeybindingsManager` for each interactive/startup/session-picker host.
- Pass that manager through application dialogs, selectors, editor factories and TUI primitives.
- Keep application actions, user configuration loading and persistence in `packages/pi/src/settings/keybindings.ts`.
- Keep extension custom/editor factory injection on the same host manager so displayed hints and handled input cannot diverge.

### File-level decomposition

| Area | Change |
|---|---|
| `packages/pi/src/ui/interactive/git-status.ts` | Porcelain execution/parsing and error isolation |
| `packages/pi/src/ui/interactive/repository-state.ts` | Repository discovery, cached snapshots, watchers, polling and lifecycle |
| `packages/pi/src/ui/interactive/footer-data-provider.ts` | Repository delegation plus non-repository footer data only |
| `packages/tui/src/components/status-line/` | Rendering, layout and injected snapshot contracts only |
| `packages/tui/src/input/keyboard/keybindings.ts` | Definitions and manager implementation only; no active global instance |
| TUI interactive components | Required constructor/options dependency for the manager they use |
| Pi interactive components and CLI hosts | Per-host manager creation and explicit propagation |
| Mirrored docs/tests | Move repository tests to Pi and document required keybinding injection |

### Migration order

1. Introduce `RepositoryState`, move existing branch tests, and move porcelain tests from TUI to Pi.
2. Delegate `FooterDataProvider` and extend the status-line provider snapshot contract.
3. Remove TUI Git acquisition/cache code and its obsolete exports/files.
4. Change TUI keybinding consumers and hint helpers to require an injected manager.
5. Propagate the Pi manager from each host through nested dialogs/selectors and remove global installation calls.
6. Update package docs, architecture maps, API docs and changelogs for the breaking TUI API change.
7. Build TUI before Pi, run both packages' full tests, run root type checking and package-boundary checks, then inspect packed public exports.

### Result

Completed. Pi now owns a dedicated repository-state service; TUI consumes synchronous repository snapshots. Keybinding-aware components require the host manager, and the mutable TUI manager registry was deleted without compatibility exports or fallback construction.

### Acceptance criteria

- TUI status-line source has no Git process import and no repository polling/watcher timer.
- TUI source has no mutable active keybinding singleton or global keybinding accessor.
- Every keybinding-aware component uses the manager supplied by its host, including hint rendering.
- Pi owns all Git acquisition and publishes only narrow branch/status snapshots to TUI.
- Session cwd changes cannot display repository data from the previous cwd.
- Watchers, polling timers and in-flight updates are inert after disposal.
- No legacy exports, fallback managers or compatibility aliases remain.

## Phase 7 - Ultragoal obstacle transition convergence

### Goal

Use one typed obstacle transition for review failures, blocker-goal projection, guard decisions and resolution. Remove the legacy review-blocker writer and all fail-open compatibility behavior.

### Canonical transition

- Replace the public `record-review-blockers` action with `record-obstacle`.
- Require the obstacle kind, rationale and applicable regression evidence in the action schema; do not infer defaults.
- Validate and build the typed obstacle before mutating the goal graph or either ledger.
- In one runtime transition, mark the reviewed goal superseded, append one pending `review_blocker` goal, persist the typed obstacle and append an `obstacle_recorded` transition receipt.
- Keep artifact-specific serialization in `obstacles.ts`; keep goal-graph orchestration in `runtime.ts`.

### Guard and resolution rules

- A `review_blocked` goal is recorded only when both an unresolved typed obstacle and its active blocker goal exist.
- Remove the empty-ledger graph fallback and the `review_blockers_recorded` compatibility event lookup.
- Treat a malformed obstacle ledger as corrupt state instead of an empty ledger.
- Completing a `review_blocker` goal resolves matching obstacles for its parent goal with durable resolution metadata.
- Keep unresolved obstacles append-only in identity; status transitions update the same durable obstacle record rather than adding aliases.

### File-level changes

| Area | Change |
|---|---|
| `ultragoal/runtime.ts` | Own the single typed obstacle/goal transition and blocker-resolution hook |
| `ultragoal/obstacles.ts` | Strict ledger reads, typed build/write, unresolved lookup and resolution |
| `ultragoal/guard.ts` | Typed obstacle plus active blocker-goal agreement; no legacy event fallback |
| Ultragoal schema/help/skill docs | Replace the old action and document required typed evidence |
| Ultragoal obstacle/guard tests | Delete compatibility-path cases; cover strict corruption, canonical recording and resolution |

### Result

Completed. `record-obstacle` is the only review-obstacle transition, guards require typed-ledger and blocker-goal agreement, malformed ledgers fail closed, and blocker completion resolves matching obstacles.

### Acceptance criteria

- `recordUltragoalReviewBlockers`, `record-review-blockers` and `review_blockers_recorded` no longer exist.
- Only `recordUltragoalObstacle` can create a review blocker projection.
- Invalid obstacle evidence writes no plan, transition ledger or obstacle ledger.
- A missing/corrupt typed obstacle cannot be accepted through graph-only fallback behavior.
- Completing the blocker goal leaves no matching unresolved obstacle.

## Phase 8 - Receipt ownership and naming

### Goal

Expose layer-specific receipt contracts and keep model-visible workflow tool details separate from durable audit records. Remove generic names, copied concepts and mutable receipt-rule extension points.

### Canonical contracts

- Agent owns `StructuredReceipt` and tool-execution receipt construction.
- Orchestrator owns `TaskExecutionReceipt` and `TaskConsequentialReceipt`.
- Workflows owns `WorkflowRuntimeReceipt`, its hash/lifecycle validation and its storage helpers.
- `WorkflowToolDetails` is a model-visible result payload, not a receipt.
- Higher layers retain only stable lower-receipt identifiers and workflow-specific metadata; no package-wide shared `ReceiptRef` is introduced without an exchanged public contract.

### File-level changes

| Area | Change |
|---|---|
| `runtime/types.ts` | Rename the generic runtime record to `WorkflowRuntimeReceipt` |
| `runtime/receipt-rules.ts` | Own receipt hashing, integrity validation and direct lifecycle consistency rules; remove the mutable rule registry |
| `runtime/storage.ts` and consumers | Rename receipt read/write APIs explicitly and remove old exports |
| `artifacts/final-package.ts` | Own deterministic final-package assembly |
| `tool/details.ts` | Own `WorkflowToolDetails` and `workflowToolDetails` |
| `artifacts/artifacts.ts` | Retain only atomic stage-artifact writing |
| Package exports, tests and docs | Replace all old names and document receipt ownership at each package boundary |

### Migration order

1. Split final-package assembly and tool details from stage-artifact writing.
2. Replace the misnamed workflow tool receipt helper at every tool boundary.
3. Rename the workflow runtime receipt type and storage/integrity APIs.
4. Collapse mutable family-rule registration into direct schema-owner validation.
5. Update tests, package exports, package READMEs, architecture docs and changelog.
6. Rebuild Workflows, run receipt/runtime/tool tests, then run the full package and root gates.

### Result

Completed. Public receipt names identify their owning layer, workflow tool payloads are no longer labeled as receipts, receipt hashing lives with receipt rules, and the mutable family-rule registry and old APIs were removed without aliases.

### Acceptance criteria

- `RuntimeReceipt`, `WorkflowReceipt`, `workflowReceipt`, `readRuntimeReceipts`, `appendRuntimeReceipt` and `isRuntimeReceiptValid` no longer exist.
- `WorkflowRuntimeReceipt` is the only workflow runtime receipt contract.
- `WorkflowToolDetails` owns no receipt identity, timing, provenance or persistence behavior.
- Stage-artifact writing, final-package assembly and tool-detail construction live in separate cohesive modules.
- Receipt integrity and lifecycle consistency have one immutable implementation.
- No lower-layer receipt schema is copied into Workflows and no speculative shared reference type is added.

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
