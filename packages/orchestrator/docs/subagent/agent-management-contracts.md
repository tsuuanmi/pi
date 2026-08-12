# Agent Management Migration Contracts

This document defines the current contract for orchestrator-owned, Pi-hosted subagent management. It describes the public boundary and invariants implemented under `packages/orchestrator/src/subagent/`.

## Scope

The contracts apply to the following orchestrator-owned surfaces:

- Standard `.agent` / `.agents` discovery;
- markdown/frontmatter agent definitions;
- generalized resource providers for agents, skills, prompts, rules, commands, context files, and system prompts;
- live agent registries and peer messaging;
- task spawning, receipts, and fork-context policies;
- native subagent execution and durable inspection.

## Owning modules

These are the intended ownership boundaries. If implementation chooses different files, update this section in the same change.

| Contract area | Primary owner | Related owners |
| --- | --- | --- |
| Resource/discovery ownership and provider precedence | `packages/pi/src/loader/resources.ts` | `src/loader/agents/profiles.ts`, `src/loader/skill.ts`, `src/loader/prompt-templates.ts`, `src/package/manager.ts` |
| Agent definition parsing | `packages/pi/src/loader/agents/definitions.ts` | `src/loader/agents/profiles.ts`, bundled role-agent prompt assets if added |
| Project resource loading | `packages/pi/src/settings/manager.ts` and `src/loader/resources.ts` | `packages/pi/docs/app/security.md` |
| Source metadata and diagnostics | `packages/pi/src/resources/source-info.ts` and `src/resources/diagnostics.ts` | resource-specific loaders |
| Scoped live registry | `packages/orchestrator/src/subagent/registry.ts` and `manager.ts` | Pi `ExtensionContext.sessionServices` |
| Durable subagent/task/receipt state | `packages/orchestrator/src/subagent/manager.ts`, `packages/orchestrator/src/subagent/store.ts`, and future task modules | `.pi/<session-id>/state/subagent/`, task runtimes |
| Bundled package continuity | Compiled package manifests and package-owned resources | Package resource loaders and tests |
| Direct-port adaptation | each porting change owner | this document and code review checklist |
| Native subagent execution and durable inspection | `packages/orchestrator/src/subagent/manager.ts`, `store.ts`, and `inspection.ts` | Orchestrator subagent lifecycle tools and receipts |

## Resource discovery contract

A future provider system must define a single resource identity model before adding broad `.agent` / `.agents` discovery.

### Resource identity

Every discovered resource must have:

- `kind`: resource type, such as `agent`, `skill`, `prompt`, `rule`, `command`, `context-file`, or `system-prompt`;
- `name` or stable key;
- `source.path` when file-backed;
- `source.providerId` and `source.providerDisplayName`;
- `source.level`: `bundled`, `user`, `project`, `package`, or `temporary`;
- `source.scopeRoot` when the provider walks ancestors;
- diagnostic state for invalid, shadowed, or skipped entries.

Existing `SourceInfo` and `ResourceDiagnostic` types may be extended, replaced, or wrapped, but resource loaders must not invent incompatible metadata shapes per resource type without an ADR update.

### Provider precedence

Default precedence for duplicate resource keys is:

1. project resource nearest to `cwd`;
2. project resource in higher ancestors, nearest first;
3. user/global resource;
4. package resource, ordered by package resolution priority;
5. bundled/native resource.

If two providers have the same level and path distance, provider priority is the tie-breaker. If still tied, deterministic lexical path order wins.

Shadowed resources must be diagnosable. Invalid resources must not silently create partial runtime objects.

### Duplicate and invalid resource behavior

- Duplicate valid names keep the winning resource and record a shadow diagnostic for each loser.
- Invalid frontmatter reports an error diagnostic with a path and message.
- Missing required fields report an error diagnostic and skip the resource.
- Unreadable files report a warning or error diagnostic and skip the resource.
- Non-matching files are ignored, not diagnosed, unless the provider explicitly treats them as malformed resources.

## `.agent` / `.agents` loading policy

Project `.agent` and `.agents` resources load from project ancestors. User/global resources load from user-level `.agent` and `.agents` directories.

## Agent definition contract

Markdown/frontmatter agent definitions should follow Pi's runtime behavior.

Minimum fields:

- `name`;
- `description`;
- optional `model`;
- optional `thinkingLevel`;
- optional `tools` and `excludeTools`;
- optional `systemPrompt` or markdown body mapped to system prompt;
- optional `persistent`.

Fields reserved for later phases:

- `spawns`;
- `output`;
- `autoloadSkills`;
- `blocking`;
- `hide`;
- `forkContext`;
- `bashAllowedPrefixes`.

A parser may accept reserved fields before their behavior exists, but unsupported behavior must be explicit in diagnostics or docs. Silent acceptance that changes nothing is not allowed for safety-relevant fields such as `forkContext`, `spawns`, or `bashAllowedPrefixes`.

## Scoped live registry contract

A live registry may use process-level storage, but it must be scoped.

Registry scope key must include:

- canonical workspace root;
- session id or runtime id;
- enough harness/runtime identity to distinguish unrelated live runs in the same process.

Live registry entries must include:

- id;
- display name;
- kind, such as `main` or `sub`;
- parent id when applicable;
- status;
- session file when available;
- created and last-activity timestamps;
- an optional live session reference.

The registry is not durable authority. Durable records remain owned by session, subagent, or task state stores. Stale durable records must not reappear as live peers unless an owner session reattaches them explicitly.

Required negative cases:

- agents in different workspaces cannot see each other;
- agents in unrelated sessions cannot see each other;
- completed, cancelled, failed, or disposed agents detach from live references;
- parent teardown detaches child live references.

## State version and reset policy

Future durable schemas for tasks, receipts, registry-derived ids, or subagent records must include a version field or an explicit invalidation/reset policy.

Because this migration does not require backward compatibility, old `.pi/<session-id>/state/subagent` records may be ignored or invalidated if the phase documents that behavior. They must not be partially interpreted as new task/registry state without a tested migration path.

Minimum durable-state requirements:

- schema version or documented reset rule;
- deterministic terminal statuses;
- append-only audit or receipt trail when state can be mutated repeatedly;
- cleanup behavior for abandoned or stale live references;
- documentation for user-visible reset/recovery commands when invalidation is chosen.

## Package continuity contract

Pi loads only compiled package resources declared by package manifests. A package change is complete when its manifest, compiled entry points, resource paths, and package-scoped tests agree.

A package resource change must verify:

- the manifest points only to compiled artifacts;
- package resources resolve through the generic loader;
- package-owned behavior is isolated from Pi's core runtime; and
- package tests cover registration and resource discovery.

## Direct-port adaptation checklist

Before directly porting external code, verify and document:

- package imports use Pi packages or local modules;
- schema libraries match Pi conventions, preferably TypeBox for tools;
- Runtime-specific text imports, APIs, or native helpers are replaced or explicitly justified;
- filesystem paths use Pi config and resource resolution helpers;
- abort/cancellation semantics match Pi agent/session behavior;
- diagnostics and source metadata use the shared contract above;
- tests are adapted to Pi's runner and package layout;
- no broad dependency or lockfile change is introduced without an explicit rationale.

Pure modules such as spawn gates, concurrency helpers, receipt shaping, ROI reconciliation, and small registry data structures are likely port candidates. Session wiring, tool registration, execution ownership, notifications, computer-use, and memory/hindsight should default to orchestrator-owned rewrites unless a later ADR proves a direct port is safer.

## Native execution contract

Subagents execute through the core in-process `AgentSession` owned by `SubagentManager`. The manager isolates resource loading, binds non-interactive extension services, controls cancellation and cooperative pause directly, and persists lifecycle state through `SubagentStore`. No terminal multiplexer, external worker command, or secondary execution identity is part of the subagent contract.

Transparency comes from current-session records, receipts, retained progress, session logs, and terminal artifacts. `subagent_inspect` remains the focused inspection surface and returns the durable record plus artifact path. Live lifecycle operations use `await`, `steer`, `pause`, `resume`, and `cancel` against the manager-owned session.

## Phase-gate summary

| Phase | Gate |
| --- | --- |
| 1A | This document's trust, precedence, agent definition, and self-hosting contracts are satisfied. |
| 1B | Phase 1A has a working metadata/diagnostics implementation for agents. |
| 2 | Scoped registry key and durable-state boundary are implemented or stubbed with tests. |
| 3 | Registry isolation passes; `awaitReply` remains gated until side-channel semantics are documented and tested. |
| 4 | Canonical model-facing task API is selected: `task`, evolved `subagent_*`, or temporary dual surface. |
| 5 | Task receipt shape and hidden/custom/system-message context policy are stable. |
| 6 | Mandatory surrounding surfaces for a final parity claim are enumerated by ADR/ROI score. |
