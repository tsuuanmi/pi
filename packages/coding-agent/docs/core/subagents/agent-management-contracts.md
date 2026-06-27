# Agent Management Migration Contracts

This document is the Phase 0 contract for making Pi's agent-management behavior converge with gajae-code. It is intentionally a contract, not an implementation plan. Later migration phases may change these contracts only by updating this document or a follow-up ADR before code changes land.

## Scope

The contracts apply to future work on:

- Gajae-style `.agent` / `.agents` discovery;
- markdown/frontmatter agent definitions;
- generalized resource providers for agents, skills, prompts, rules, commands, context files, and system prompts;
- live agent registries and peer messaging;
- task spawning, receipts, and fork-context policies;
- worktree/tmux worker orchestration.

## Owning modules

These are the intended ownership boundaries. If implementation chooses different files, update this section in the same change.

| Contract area | Primary owner | Related owners |
| --- | --- | --- |
| Resource/discovery ownership and provider precedence | `packages/coding-agent/src/core/skills/resource-loader.ts` or a new `src/core/resource-providers.ts` | `src/core/agents/agent-profiles.ts`, `src/core/skills/skills.ts`, `src/core/skills/prompt-templates.ts`, `src/core/package-manager/package-manager.ts` |
| Agent definition parsing | `packages/coding-agent/src/core/agents/agent-profiles.ts` or a new `src/core/agents/agent-definitions.ts` | bundled role-agent prompt assets if added |
| Trust policy | `packages/coding-agent/src/core/settings/settings-manager.ts` and `src/core/trust/project-trust.ts` | `src/core/skills/resource-loader.ts`, `docs/security.md` |
| Source metadata and diagnostics | `packages/coding-agent/src/core/misc/source-info.ts` and `src/core/misc/diagnostics.ts` | resource-specific loaders |
| Scoped live registry | a new `packages/coding-agent/src/core/agent-registry.ts` | `src/core/agent-session/agent-session.ts`, `src/core/subagents/subagents.ts`, `src/api/types.ts` |
| Durable subagent/task/receipt state | `packages/coding-agent/src/core/subagents/subagents.ts` and future task modules | `.pi/workflows/subagents/`, workflow runtimes |
| Self-hosting continuity | built-in workflow tools and skills | `src/workflows/*`, `src/extensions/workflow-tools.ts` |
| Direct-port adaptation | each porting change owner | this document and code review checklist |
| Worktree/tmux orchestration | future task/worktree modules and `src/harness-runtime/seams.ts` | docs/tmux.md, workflow docs |

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

1. trusted project resource nearest to `cwd`;
2. trusted project resource in higher ancestors, nearest first;
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

## `.agent` / `.agents` trust policy

Project `.agent` and `.agents` resources are project-local resources. They must use the same project trust gate as `.pi` resources unless a later ADR explicitly changes this.

Default policy:

- user/global `.agent` / `.agents` resources may load without project trust;
- project `.agent` / `.agents` resources load only when the project is trusted;
- ancestor walking must stop at the repository root when known, otherwise at filesystem root;
- the home directory must not be counted as both a user-level and project-level `.agent` / `.agents` root.

Negative case: when project trust is denied or unresolved in a mode that does not prompt, project `.agent` / `.agents` resources must not load.

## Agent definition contract

Markdown/frontmatter agent definitions should converge on Gajae-style behavior while fitting Pi's runtime.

Minimum fields:

- `name`;
- `description`;
- optional `model`;
- optional `thinkingLevel`;
- optional `tools` and `excludeTools`;
- optional `systemPrompt` or markdown body mapped to system prompt;
- optional `persistent`.

Gajae-parity fields reserved for later phases:

- `spawns`;
- `output`;
- `autoloadSkills`;
- `blocking`;
- `hide`;
- `forkContext`;
- `bashAllowedPrefixes`.

A parser may accept reserved fields before their behavior exists, but unsupported behavior must be explicit in diagnostics or docs. Silent acceptance that changes nothing is not allowed for safety-relevant fields such as `forkContext`, `spawns`, or `bashAllowedPrefixes`.

## Scoped live registry contract

A Gajae-like live registry may use process-level storage, but it must be scoped.

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

The registry is not durable authority. Durable records remain owned by session, subagent, workflow, or future task state stores. Stale durable records must not reappear as live peers unless an owner session reattaches them explicitly.

Required negative cases:

- agents in different workspaces cannot see each other;
- agents in unrelated sessions cannot see each other;
- completed, cancelled, failed, or disposed agents detach from live references;
- parent teardown detaches child live references.

## State version and reset policy

Future durable schemas for tasks, receipts, registry-derived ids, or subagent records must include a version field or an explicit invalidation/reset policy.

Because this migration does not require backward compatibility, old `.pi/workflows/subagents` records may be ignored or invalidated if the phase documents that behavior. They must not be partially interpreted as new task/registry state without a tested migration path.

Minimum durable-state requirements:

- schema version or documented reset rule;
- deterministic terminal statuses;
- append-only audit or receipt trail when state can be mutated repeatedly;
- cleanup behavior for abandoned or stale live references;
- documentation for user-visible reset/recovery commands when invalidation is chosen.

## Self-hosting continuity contract

Pi may drop old compatibility, but it must not strand itself mid-migration.

A phase may remove or break old role-agent/subagent surfaces only when the same phase verifies replacements for:

- `ralplan` planner, architect, critic role dispatch;
- `team` worker spawning or its replacement;
- `ultragoal` goal-worker spawning or its replacement.

A phase fails if it adds Gajae-style user agents but prevents built-in workflows from dispatching the role agents needed to continue planning or execution.

## Direct-port adaptation checklist

Before directly porting Gajae code, verify and document:

- package imports are changed from `@gajae-code/*` to Pi packages or local modules;
- schema libraries match Pi conventions, preferably TypeBox for tools;
- Bun-only text imports, APIs, or native helpers are replaced or explicitly justified;
- filesystem paths use Pi config and resource resolution helpers;
- abort/cancellation semantics match Pi agent/session behavior;
- diagnostics and source metadata use the shared contract above;
- tests are adapted to Pi's runner and package layout;
- no broad dependency or lockfile change is introduced without an explicit rationale.

Pure modules such as spawn gates, concurrency helpers, receipt shaping, ROI reconciliation, and small registry data structures are likely port candidates. Session wiring, tool registration, worktree/tmux ownership, notifications, computer-use, and memory/hindsight should default to Pi-native rewrites unless a later ADR proves a direct port is safer.

## Worktree/tmux gate

Worktree and tmux orchestration must not begin until a threat-model ADR exists. That ADR must cover:

- worker owner identity and cleanup authority;
- parent-checkout protection;
- dirty parent checkout behavior;
- pre-existing path/worktree collisions;
- nested repositories and worktrees;
- manual edits in worker checkouts;
- worker crash and orphaned tmux sessions;
- patch application and merge conflict rules;
- cleanup idempotency and permission failures;
- tmux absence or version mismatch.

Until that ADR is accepted, `git-worktree-isolation` and `tmux-session-orchestration` remain deferred seams. `cross-harness-omx-fallback` remains permanently blocked unless a later approved plan reverses that policy.

## Phase-gate summary

| Phase | Gate |
| --- | --- |
| 1A | This document's trust, precedence, agent definition, and self-hosting contracts are satisfied. |
| 1B | Phase 1A has a working metadata/diagnostics implementation for agents. |
| 2 | Scoped registry key and durable-state boundary are implemented or stubbed with tests. |
| 3 | Registry isolation passes; `awaitReply` remains gated until side-channel semantics are documented and tested. |
| 4 | Canonical model-facing task API is selected: `task`, evolved `subagent_*`, or temporary dual surface. |
| 5 | Task receipt shape and hidden/custom/system-message context policy are stable. |
| 6 | Worktree/tmux threat-model ADR is accepted. |
| 7 | Mandatory surrounding surfaces for a final parity claim are enumerated by ADR/ROI score. |
