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
| 2 | Workflows-owned compiled package artifact | Concurrent implementation present; validate, do not overwrite |
| 3 | Agent-owned web tool execution | Blocked by concurrent edits in Pi web/session factory files |
| 4 | Session root and session-id ownership | Blocked by concurrent Pi session refactor |
| 5 | Workflow transition initialization/private alias removal | Blocked by concurrent transition/runtime cleanup |
| 6 | HUD provider, sanitization, and explicit invalidation | Blocked by concurrent interactive-mode edits |
| 7 | Web capability/worker authoring boundary | Blocked by concurrent Web Runtime provider refactor |
| 8 | TUI repository state and global keybinding state | Planned after higher-priority boundaries |

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

## Phase 2 - Workflows artifact ownership

### Goal

One self-contained Workflows package is used for standalone publication and Pi bundling.

### Files under concurrent implementation

| Action | File | Required end state |
|---|---|---|
| Update | `packages/workflows/package.json` | `pi` resources point to shipped `dist/` files; `files` contains the self-contained artifact only |
| Create/update | `packages/workflows/scripts/copy-assets.mjs` | Workflows alone copies skill/state/agent assets into `dist/` |
| Update | `packages/pi/scripts/copy-assets.mjs` | Copy Workflows and Web Runtime `package.json` plus `dist/` without flattening or rewriting |
| Delete | `packages/pi/scripts/write-bundled-package-manifests.mjs` | Remove host-owned package-specific rewrite logic |
| Update | Manifest/package tests and docs | Verify every manifest path exists in a packed/bundled layout |

### Completion gate

- Standalone Workflows package resources all exist under published `files`.
- Pi bundle preserves the same package-relative paths.
- No duplicate Pi copy of Workflows source assets exists.
- No Workflows-specific manifest rewrite remains in Pi.

## Phase 3 - Agent-owned web tool execution

### Goal

Pi may authorize and transport a browser tool call, but Agent owns validation, hooks, policy, execution, details validation, output limiting, receipts, and lifecycle events.

### Required design

Split the current mixed Agent tool module into:

- `packages/agent/src/tool/executor.ts`: canonical reusable execution of one prepared tool call with injected hook/event context;
- `packages/agent/src/agent/tool-execution.ts`: Agent-loop batch scheduling, transcript message ordering, and continuation behavior built on the executor.

Expose one concise Agent-owned entry for externally transported calls. Do not expose Agent internals or add a second executor in Pi.

### Files

| Action | File | Change |
|---|---|---|
| Create | `packages/agent/src/tool/executor.ts` | Extract single-call validation/policy/hook/execute/limit/details/receipt lifecycle |
| Update | `packages/agent/src/agent/tool-execution.ts` | Delegate each batch item to the canonical executor |
| Update | `packages/agent/src/agent/index.ts` and public types | Add the reviewed external-call entry using the same configured hooks/events/tools |
| Update | `packages/pi/src/runtime/agent-session-factory.ts` | Replace direct `Tool.prepareArguments()`/`Tool.execute()` with Agent-owned execution |
| Update | `packages/pi/src/web-providers/stream.ts` | Keep only WebTool conversion and transport/result mapping |
| Update | Agent and Pi tests/docs/changelogs | Prove identical policy, hooks, limits, details, receipts, and events for model and browser calls |

### Completion gate

- No Pi/Web Runtime call site invokes `Tool.execute()` directly.
- Browser tool calls cannot bypass Agent policy or lifecycle evidence.
- No synthetic transcript inconsistency is introduced; external calls use an explicit non-transcript execution contract unless a real assistant tool-call message exists.

## Phase 4 - session identity and root ownership

### Goal

Keep one path encoder/root implementation and give differently scoped validators distinct names.

### Decision

Do not create an extra package solely for a few path functions. Retain the existing one-way dependency while making the contract explicit:

- Workflows' public `session/root` subpath owns shared `.pi` root and path-segment encoding used by both packages.
- Pi owns generated Pi session-id syntax and entry-id generation.
- Rename the Pi syntax validator to `assertPiSessionId`.
- Rename Workflows' non-empty path precondition to `requireSessionId`.
- Remove any duplicate encoder or ambiguous `assertSessionId` export.

### Files under concurrent edits

`packages/pi/src/session/`, `packages/workflows/src/session/root.ts`, their public barrels, session tests, docs, and changelogs.

## Phase 5 - transition initialization and private runtime aliases

### Goal

Every workflow tool loads its required transition/policy implementation through package-owned public runtime code; Pi does not inject `#workflows/*` aliases.

### Files under concurrent edits

- `packages/workflows/src/extension.ts`, tool registration, runtime/skill transition modules, and root exports.
- `packages/pi/src/loader/extensions/loader.ts`.
- Package imports/exports, extension composition tests, boundary tests, and workflow command tests.

### Completion gate

- `ralplan_run_agent` works from the dynamically loaded extension without another import registering side effects first.
- Pi contains no `#workflows/*` alias.
- Workflows compiled entry resolves only its own package imports/relative modules.
- Removed transitions/fallback commands have no import, export, test, doc, or asset references.

## Phase 6 - HUD ownership

### Goal

Workflows owns workflow HUD data; TUI owns normalized presentation; Pi owns provider composition and explicit invalidation.

### Files

- TUI HUD model/render contracts.
- Workflows active-state and skill HUD producers.
- Pi extension UI context/controller and interactive status composition.
- Workflow hooks and HUD tests/docs.

### Required changes

- Remove Workflows' duplicate render sanitization; produce canonical `HudSummary` values.
- Add an explicit Pi UI invalidation capability and delete the `__hud_refresh__` sentinel.
- Register a HUD reader/provider through Pi composition instead of embedding workflow policy in TUI.
- Keep workflow freshness/visibility in Workflows and ANSI/layout in TUI.

## Phase 7 - Web Runtime capability boundary

### Goal

Advertised model capabilities equal implemented behavior, and third-party worker authoring uses only public APIs.

### Required changes

- Do not advertise tool/image/file capability through Pi until conversion and connector transport exist.
- Pi owns AI-message-to-attachment conversion; Web Runtime owns browser upload.
- Export a reviewed worker bootstrap or keep provider workers internal and remove claims of turnkey third-party authoring.
- Scope worker pools and entitlement re-verification explicitly for session/resource reload.

This phase must follow the active Web Runtime provider refactor and Phase 3 tool execution.

## Phase 8 - TUI host state

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
6. Run `npx tsgo --noEmit` from the repository root.
7. Run `npm run check:package-boundaries`.
8. Validate package resource paths against the actual packed/bundled layouts.
9. Review `git diff`, lockfile changes, generated files, docs, changelogs, and final status.

A phase with failures caused by another active workstream remains blocked; it is not completed through a fallback or by reverting that workstream.
