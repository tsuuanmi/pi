# @tsuuanmi/pi-workflows

Workflow runtime skills for Pi: `deep-interview`, `ralplan`, `team`, and `ultragoal`. This package provides the `pi workflow` control plane, the four bundled [Skills](https://github.com/tsuuanmi/pi/tree/main/packages/pi/docs/core/skills/skills.md), reusable role agent profiles, and the harness runtime that backs them.

The four skills form a gated pipeline:

```
deep-interview (clarity gate) → ralplan (feasibility gate) → explicit approval (consent gate) → team / ultragoal (execution)
```

Each stage can be skipped, but skipping reduces quality assurance. Workflows are planning/execution agents, not a replacement for the user's judgment — no skill mutates product code or invokes execution until the user explicitly approves.

## Table of Contents

- [Installation](#installation)
- [Package Scope](#package-scope)
- [Built-in Skills](#built-in-skills)
  - [deep-interview](#deep-interview)
  - [ralplan](#ralplan)
  - [team](#team)
  - [ultragoal](#ultragoal)
- [Skill Pipeline and Gating](#skill-pipeline-and-gating)
- [`pi workflow` Control Plane](#pi-workflow-control-plane)
- [Reusable Agent Profiles](#reusable-agent-profiles)
- [Model-Visible Tools](#model-visible-tools)
- [Harness Runtime](#harness-runtime)
  - [Session Layout](#session-layout)
  - [Session-Scoped Isolation](#session-scoped-isolation)
  - [Corrupt-State Recovery](#corrupt-state-recovery)
  - [Shared Modules](#shared-modules)
- [Public API](#public-api)
- [Development](#development)
- [Further Reading](#further-reading)
- [License](#license)

## Installation

This package is bundled with Pi and normally consumed transitively via `@tsuuanmi/pi`. To depend on it directly:

```bash
npm install @tsuuanmi/pi-workflows
```

## Package Scope

`@tsuuanmi/pi-workflows` ships the workflow runtime: the `pi workflow` CLI, the harness control plane (sessions, leases, RPC, GC), the four workflow skills and their model-visible tools, and the reusable role agent profiles. Application-level wiring (session persistence, compaction, system-prompt assembly) lives in `@tsuuanmi/pi`, which depends on this package.

State root: `PI_HARNESS_STATE_ROOT` or `<workspace>/.pi/state/harness`. Runtime artifacts persist under the current session root, e.g. `.pi/<session-id>/workflows/<skill>/` and `.pi/<session-id>/state/`.

## Built-in Skills

| Skill | Purpose | When to use |
|-------|---------|-------------|
| `deep-interview` | Socratic requirements interview with ambiguity scoring before planning or execution. | Vague, complex, or high-risk requests where assumptions must be exposed before work starts. |
| `ralplan` | Consensus planning that turns a task or `deep-interview` spec into a pending-approval implementation plan using planner, architect, and critic passes. | Turning a spec or task into an explicit, reviewed, approvable plan. |
| `team` | Coordinate parallel implementation workers after an approved plan exists. | When parallel workstreams are useful and execution has been explicitly approved. |
| `ultragoal` | Goal-tracked autonomous execution for an approved, concrete plan. | Implementation after explicit approval, with verification and concise progress tracking. |

Invoke a skill with `/skill:<name>` (e.g. `/skill:ralplan`). Each skill has a `SKILL.md` under `src/skills/<name>/`.

### deep-interview

```bash
/skill:deep-interview [--quick|--standard|--deep] <idea>
```

| Mode | Description |
|------|-------------|
| `--quick` | Fewer rounds, broader questions |
| `--standard` | Default depth |
| `--deep` | More rounds, deeper probing |

Deep Interview turns a vague idea into a concrete spec before any mutation starts. It asks "what are you assuming?" instead of "what do you want?", scores clarity across weighted dimensions every round, and refuses to finalize until ambiguity drops below a pinned threshold (**0.05 / 5%**) **and** an independent closure guard plus a one-sentence goal restatement both pass.

**Phases:**

0. **Threshold marker** (blocking prerequisite): the first line emitted is exactly `Deep Interview threshold: 5% (source: default)`.
1. **Initialize**: classify greenfield vs brownfield (using `read`/`bash` or a read-only `planner`/`architect` subagent), normalize oversized initial context, init state.
2. **Round 0 — Topology enumeration gate**: lock 1–6 top-level components before depth-first questioning can overfit to the most-described component. Multi-component fixtures must surface every sibling (e.g. Ingestion, Normalization, Review UI, Export) even when one is detailed.
3. **Interview loop**: ask ONE question per round, targeting the weakest component/dimension pair, rotating across active components. Score ambiguity after each answer.
4. **Lateral review panel**: convene `researcher`, `contrarian`, `simplifier` (and `architect` when scope shape changed) as parallel read-only subagents at ambiguity-milestone transitions and before synthesizing agent-supplied answers.
5. **Crystallize spec**: run `pi workflow deep-interview closure-check`, then `pi workflow deep-interview restate-goal` (two-loop cap on Adjust/Missing), then persist via `pi workflow deep-interview write-spec` to `.pi/<session-id>/specs/deep-interview-<slug>.md`.
6. **Execution bridge**: present options (ralplan / ultragoal / team / refine / stop) and hand off only after explicit selection.

**Ambiguity is bidirectional and non-monotonic.** A later answer can raise ambiguity (contradiction, internal inconsistency, low-quality/evasive, or scope expansion). Triggers lower the affected dimension score; the weighted formula raises ambiguity — there is no separate penalty term. Raises are silent and surface via the per-round report and next-question targeting.

**Weights:**

- Greenfield: `ambiguity = 1 - (goal × 0.40 + constraints × 0.30 + criteria × 0.30)`
- Brownfield: `ambiguity = 1 - (goal × 0.35 + constraints × 0.25 + criteria × 0.25 + context × 0.15)`

Score every active component independently; the overall dimension score is the minimum (or coverage-weighted weakest) across active components. Deferred components are excluded from the math but remain listed.

**Control plane:** use `pi workflow state deep-interview <read|write|clear|doctor>` for envelope state and `pi workflow deep-interview <plan-question|record-answer|record-scoring|read-compact|closure-check|restate-goal|write-spec>` for runtime state and artifacts. Use `subagent_spawn`/`subagent_await` for read-only research, auto-research, auto-answer, and lateral-panel personas.

**Boundaries:** planning only — `edit`/`write` are runtime-blocked while a deep-interview workflow is active in a non-finished phase (only `.pi/**` is always blocked; only system-temp scratch outside the project is writable). Ask one question at a time. Do not proceed to execution until ambiguity ≤ threshold, closure passes, the restate is confirmed, and the user explicitly approves an execution path.

### ralplan

```bash
/skill:ralplan [--interactive] [--deliberate] <task or spec path>
```

| Flag | Description |
|------|-------------|
| `--interactive` | Require user approval at each stage |
| `--deliberate` | Enable deeper deliberation passes |

Ralplan produces a durable pending-approval plan through guarded role agents run as separate `ralplan_run_agent` invocations (not simulated inline):

1. **Explorer** (`stage: "pre-planner"`) — context map for the pre-planner gate when the gate is missing or retrying.
2. **Planner** (`stage: "planner"`) — problem statement, principles, ≥2 viable options (or rationale for one), recommended approach, risks, verification plan, open questions.
3. **Architect** (`stage: "architect"`) — strongest architectural objection, integration/ownership concerns, tradeoff tensions, synthesis.
4. **Critic** (`stage: "critic"`) — acceptance criteria quality, risk mitigation, testability, missing edge cases, verdict: `APPROVE` / `ITERATE` / `REJECT`.
5. **Revision** (`stage: "revision"`) — if the critic requests iteration, the Planner revises with consolidated feedback; Architect/Critic re-review. Cap at five iterations.
6. **Expert** (`stage: "expert-stage"`) — escalation decision after iterate-cap or human-blocked explorer gate.
7. **Final** (`stage: "final"`) — persist the pending-approval plan; `pending-approval.md` is also written.
8. Stop and ask for explicit execution approval.

After explicit approval or rejection, call `pi workflow ralplan approve-plan`. Default approved handoff is `target: "ultragoal"`; use `target: "team"` when coordinated parallel workers are needed, or `target: "stop"` to record approval without starting another workflow.

**Critic-verdict enforcement:** `approve-plan` refuses to approve when the latest critic verdict is `REJECT` (set `overrideCriticVerdict: true` to force), and warns when it is `ITERATE`. `pi workflow ralplan doctor` surfaces the same signal as a warning while a plan is pending.

**Pre-execution vagueness gate:** when `team` or `ultragoal` is dispatched with a vague prompt (no concrete signals and ≤ 15 words), the workflow tools redirect to `ralplan` instead of starting execution. Concrete signals include file paths, issue references (`#123`), snake_case/CamelCase symbols, numbered steps, acceptance/criteria/must/should language, error/exception/traceback, and fenced code blocks. The gate checks specificity, not file existence. Prefix the prompt with `force:` or `!` to bypass.

**Control plane:** use `pi workflow state ralplan ...` for envelope state; `pi workflow ralplan <record-explorer-gate|write-artifact|status|read-compact|doctor|approve-plan>` for non-spawn runtime operations; and `ralplan_run_agent` for guarded role-agent execution.

**Boundaries:** planning only. Persist artifacts with `pi workflow ralplan write-artifact`; do not directly edit `.pi/<session-id>/plans` or `.pi/<session-id>/workflows` unless recovering with explicit user approval. Explorer/Planner/Architect/Critic/Expert passes must use `ralplan_run_agent` and follow workflow-selected order. Role agents persist durable output and return receipt-only summaries (run id, stage, stage_n, path).

### team

```bash
/skill:team <approved plan or task>
```

Team coordinates multiple implementation workstreams as subagent sessions. Use it only after the user explicitly approves execution.

1. Read the approved plan or task.
2. Start runtime coordination with `pi workflow team start`; inspect with `pi workflow team snapshot` / `pi workflow team read-compact`.
3. Split work into independent workstreams with clear ownership, files, and verification.
4. Persist each workstream with `pi workflow team create-task`.
5. Use `pi workflow team transition-task` for starts, blocking, failure, and completion. Completed tasks require completion evidence.
6. Use `pi workflow team send-message` for cross-workstream coordination.
7. Merge results, resolve conflicts, run requested checks.
8. Close the run with `pi workflow team complete`.

**Task states:** `pending` → `in_progress` → `completed` (or `blocked` / `failed`).

**Gates:** completed tasks require a reviewer `review_report` (`pi workflow team record-review-gate`) and completion requires a prover `evidence_matrix` (`pi workflow team record-completion-gate`). Both are fail-closed validated; blocking artifacts escalate to `human_blocked` on the second blocking attempt (bounded retry).

**Control plane:** use `pi workflow state team ...` for envelope state; `pi workflow team <start|snapshot|read-compact|create-task|transition-task|send-message|record-review-gate|record-completion-gate|complete>` for non-spawn runtime operations; and `team_spawn_task_agent`, `team_spawn_review_agent`, and `team_spawn_prover_agent` for guarded worker/reviewer/prover execution.

**Boundaries:** if the request is vague or lacks acceptance criteria, route to `/skill:ralplan` first. If a single autonomous worker is enough, prefer `/skill:ultragoal`. Keep workers scoped to non-overlapping files/components when possible.

### ultragoal

```bash
/skill:ultragoal <approved plan or concrete task>
```

Ultragoal executes an approved concrete goal end-to-end with verification.

1. Restate the approved goal and acceptance criteria.
2. Create or resume runtime goal state with `pi workflow ultragoal status`, `pi workflow ultragoal read-compact`, and `pi workflow ultragoal create-plan` when no plan exists.
3. Start the next runnable goal with `pi workflow ultragoal start-next`.
4. Inspect files, make the smallest complete set of changes, run required checks.
5. Checkpoint each goal with `pi workflow ultragoal checkpoint`. Complete checkpoints require substantive evidence and the **full quality gate**: `architectReview`, `executorQa`, and `iteration`. Old `executorQa + contractCoverage` top-level gates and free-form `{status}` gates are rejected (fail closed).
6. Use `pi workflow ultragoal record-review-blockers` when review/verification finds blockers that must become durable follow-up work; use `pi workflow ultragoal classify-blocker` only when a `failed`/`blocked` checkpoint is truly human-blocked.
7. Use `pi workflow ultragoal guard` before treating a stored completion receipt as complete — it reports stale/missing/dirty receipts and fail-closed unreadable state.

**Goal states:** `pending` → `active` → `completed` (or `failed` / `blocked` / `review_blocked`).

**Control plane:** use `pi workflow state ultragoal ...` for envelope state; `pi workflow ultragoal <create-plan|status|read-compact|start-next|checkpoint|record-review-blockers|classify-blocker|guard>` for non-spawn runtime operations; and `ultragoal_spawn_goal_agent` for guarded worker execution.

**Boundaries:** if the request is vague, run `/skill:deep-interview` or `/skill:ralplan` first. If no execution approval exists, stop and ask. Do not widen scope beyond the approved goal. If the plan proves wrong, stop and ask or route back to `/skill:ralplan` rather than improvising a larger scope.

## Skill Pipeline and Gating

| Gate | Skill | What it enforces |
|------|-------|------------------|
| Clarity | deep-interview | Ambiguity ≤ 5%, closure guard, restated goal confirmed before a spec is written |
| Feasibility | ralplan | Planner/Architect/Critic consensus; critic REJECT blocks approval |
| Consent | (separate) | User explicitly approves before any execution skill runs |
| Execution | team / ultragoal | Approved plan only; vagueness gate redirects underspecified prompts to ralplan |

deep-interview persists its spec to `.pi/<session-id>/specs/deep-interview-<slug>.md`; ralplan persists plans under `.pi/<session-id>/plans/ralplan/<run-id>/`. Both stop for explicit approval rather than mutating product code.

## `pi workflow` Control Plane

`pi workflow` is the CLI front end for the harness control plane. Every verb accepts `--json` for machine-readable output and `--input '<JSON object>'` for structured arguments.

```text
pi workflow state <skill> read --json
pi workflow start --input '{"workspace":".","sessionId":"optional","detach":true}' --json
pi workflow submit --input '{"sessionId":"h-...","prompt":"work"}' --json
pi workflow observe --input '{"sessionId":"h-..."}' --json
pi workflow classify --input '{"sessionId":"h-..."}' --json
pi workflow recover --input '{"sessionId":"h-..."}' --json
pi workflow validate --input '{"sessionId":"h-...","checks":[{"name":"check","command":"npm run check"}]}' --json
pi workflow finalize --input '{"sessionId":"h-..."}' --json
pi workflow operate --input '{"sessionId":"h-...","goal":"...","maxIterations":10}' --json
pi workflow gc [--prune] [--dry-run] --json
pi workflow events --input '{"sessionId":"h-..."}' --json
pi workflow retire --input '{"sessionId":"h-..."}' --json
```

Most verbs route to a live runtime owner when one is running for the session (`start --detach` spawns a detached owner); otherwise they fall back to a primitive (no-owner) path so the CLI can inspect and drive sessions without a running owner.

### `pi workflow gc`

A liveness-only garbage-collection sweep for harness owner sessions. It reaps only confirmed-dead owner sessions: a session is removable iff its lease classifies as `dead` (liveness-only, TTL-irrelevant) **and** a fail-closed pid probe confirms the process is gone (`ESRCH`). It keeps expired-but-alive (flagged `expired-alive` but never removed), `EPERM`, malformed, missing, and no-pid leases. Dry-run by default; `--prune` performs deletion; `--dry-run` is forced when both are passed. The probe is fail-closed: ambiguous/invalid pids fold into `unknown`, which keeps the session.

```bash
pi workflow gc --json             # dry run (default): report only
pi workflow gc --json --prune     # delete confirmed-dead sessions
pi workflow gc --json --dry-run   # explicit dry run
```

JSON report shape (committed contract):

```jsonc
{
  "dry_run": true,
  "stores": [{ "store": "harness-leases", "roots": ["/path/.pi/state/harness"], "sessions": [] }],
  "counts": { "total": 0, "removable": 0, "kept": 0, "expiredAlive": 0, "errors": 0 },
  "errors": []
}
```

State root: `PI_HARNESS_STATE_ROOT` or `<workspace>/.pi/state/harness`. See [docs/workflow.md](docs/workflow.md) for the full control-plane reference, including the deferred-seam registry, `validateReceiptFamilyConsistency`, and HUD internals.

## Reusable Agent Profiles

Workflows dispatch isolated role agents using reusable agent profiles. This package provides default profiles under `src/agents/`:

| Profile | Role | Default thinking | Default tools |
|---------|------|------------------|---------------|
| `planner` | Turn requirements into executable plans. | `high` | `read`, `grep`, `find`, `bash` |
| `architect` | Feasibility, architecture, and integration review. | `high` | `read`, `grep`, `find`, `bash` |
| `critic` | Risks, tests, edge cases, and failure modes. | `high` | `read`, `grep`, `find`, `bash` |
| `worker` | Execute an assigned task or goal. | `medium` | `read`, `bash`, `write`, `edit` |
| `explorer` | Pre-planner context mapping for ralplan. | `low` | `read`, `bash` |
| `expert` | Expert-stage escalation after iterate-cap or explorer-gate `human_blocked`. | package default | package/default tools |
| `prover` | Produce the team completion `evidence_matrix`. | `low` | `read`, `bash` |
| `reviewer` | Produce the team task `review_report`. | `medium` | `read`, `bash` |

Bundled profiles with frontmatter set `persistent: true` when they need resumable context. Generic `subagent_*` tools accept per-invocation profile overrides. Guarded workflow spawns compute the legal role/task/goal first; team and ultragoal spawn tools reject runtime model/tool overrides, while `ralplan_run_agent` exposes role-agent overrides for explorer/planner/architect/critic/expert passes.

Profiles are authored as markdown files with YAML frontmatter. Pi discovers them from user `~/.agent`/`~/.agents`, enabled package `agents/*.md` resources (including these), and trusted project `.agent`/`.agents` directories. Project ancestor profiles closest to the current directory win. See [docs/workflow.md](docs/workflow.md) for the full discovery rules, frontmatter fields, and the standard `.agent`/`.agents` resource layout.

## Model-Visible Tools

Workflow-owned tools are model-visible and registered by the workflow extension. Spawn tools include `subagent_spawn` / `subagent_status` / `subagent_await` / `subagent_steer` / `subagent_pause` / `subagent_resume` / `subagent_cancel`, `ralplan_run_agent`, `team_spawn_task_agent`, `team_spawn_review_agent`, `team_spawn_prover_agent`, and `ultragoal_spawn_goal_agent`. Deep Interview also exposes first-class runtime tools: `deep_interview_plan_question`, `deep_interview_record_answer`, `deep_interview_record_scoring`, `deep_interview_read_compact`, `deep_interview_closure_check`, `deep_interview_restate_goal`, and `deep_interview_write_spec`. Spawn tools call the main session's `SubagentManager` directly in-process — the only place a subagent can be spawned and run to completion. The role agents are ordinary subagents; the workflow's special part is turn order, guarded role checks, and result→artifact handoff. Normal coding tools (`read`, `bash`, `edit`, `write`, `lsp`) remain available; hard filters such as explicit tool allowlists and `excludeTools` still take precedence.

## Harness Runtime

The harness runtime backs the `pi workflow` CLI and the four skills. Shared infrastructure lives under `src/harness/` and is organized by concern: `runtime/` (sessions, leases, RPC, GC, mutation, storage, receipt rules, owner), `shared/` (cross-skill artifacts, audit, compaction, orchestration, registry, session, and state utilities), and `subagents/` (generic subagent tools). Skill-owned TypeScript and `SKILL.md` assets live together under `src/skills/<skill>/`.

Key seams for contributors:

- **Deferred-seam registry** (`harness/runtime/seams.ts`): an explicit, extensible list of designed-not-built harness extensions (`tmux-session-orchestration`, `git-worktree-isolation`, `cross-harness-omx-fallback` [permanently blocked], `remote-transport`, `global-daemon`, `capability-token-auth`). Requesting an unsupported seam fails closed with a self-documenting `seam_unsupported:<name>` token instead of a silent no-op. Add entries via `DeferredSeamRegistry.register` without changing the orchestrator.
- **`validateReceiptFamilyConsistency`** (`harness/runtime/receipt-rules.ts`): a write-path guard inside `mutateRuntimeSession` that rejects receipts whose post-state lifecycle contradicts their family target. It throws before any write so a contradiction leaves zero orphan events/receipts/state. Conservative and pluggable; future receipt families register rules in `receiptFamilyConsistencyRules`.
- **HUD rendering**: per-skill HUD builders live in the owning skill folders (`deep-interview-hud.ts`, `ralplan-hud.ts`, `team-hud.ts`, `ultragoal-hud.ts`). Workflow HUD synchronization is registered by the extension through `@tsuuanmi/pi-tui`; workflow mirroring remains session-scoped because the status line reads active state directly.

### Session Layout

All session-aware path builders require a `sessionId` — there is no global fallback for session-scoped state. This ensures workflow state is isolated per session.

| Path | Description |
|------|-------------|
| `.pi/{sessionId}/state/` | Session state directory |
| `.pi/{sessionId}/workflows/{skill}/` | Workflow-specific state |
| `.pi/{sessionId}/specs/` | Generated specs (deep-interview) |
| `.pi/{sessionId}/plans/` | Generated plans (ralplan) |
| `.pi/{sessionId}/activity.json` | Session activity file |
| `.pi/{sessionId}/team/{teamId}/` | Team coordination state |
| `.pi/audit.jsonl` | Global audit log (append-only JSONL) |

Team coordination state lives under `.pi/{sessionId}/team/{teamId}/`, scoped to the session that started the team run.

### Session-Scoped Isolation

Workflow state and artifacts are isolated per session. A fresh session sees an empty per-session bucket by construction — no state leaks from prior sessions. A session id is required on every `pi workflow ...` verb (including `start`); no verb mints a session id, and all fail closed with `sessionId is required` when it is missing. The `pi workflow` CLI requires `--session <id>` or `PI_SESSION_ID` for the `state` command. There is no global `.pi/` fallback; without a session id the CLI errors out. Spawn tools read the session id from `ctx.sessionManager.getSessionId()`, so spawns always co-locate under the current session. The detached `RuntimeOwner` is lifecycle-only (no `SubagentManager`).

### Corrupt-State Recovery

If a skill's state becomes corrupt or stuck in a terminal phase, use `pi workflow state <skill> clear --force` to reset (optionally with `--session <id>`). The `--force` flag bypasses normal transition guards and re-seeds the state for a fresh start. `pi workflow state <skill> doctor` reports the resolved session id and state path, and emits the `--force` recovery hint for terminal skills.

### Shared Modules

`src/harness/shared/` provides common utilities used by all four skills:

| Directory | Modules | Description |
|-----------|---------|-------------|
| `artifacts/` | `artifacts.ts` | Durable artifact writes and receipt helpers. |
| `audit/` | `audit-log.ts`, `decision-ledger.ts`, `tamper-detection.ts`, `transaction-journal.ts` | Append-only audit, decision, tamper, and transaction records. |
| `compaction/` | `compaction.ts` | Prompt-budgeted compact workflow projections. |
| Skill HUD modules | `deep-interview-hud.ts`, `ralplan-hud.ts`, `team-hud.ts`, `ultragoal-hud.ts` | HUD chip formatting for each workflow skill, colocated with the owning skill harness. |
| `orchestration/` | `context-templates.ts`, `expected-next-role.ts`, `gate-verdicts.ts`, `handoff.ts`, `vagueness-gate.ts`, `workflow-tool-utils.ts` | Cross-workflow prompts, handoffs, gates, expected-next checks, and tool helpers. |
| `registry/` | `skill-registry.ts`, `workflow-manifest.ts` | Built-in skill registry and manifest metadata. |
| `session/` | `paths.ts`, `session-layout.ts`, `session-resolution.ts` | Session-scoped path builders and session-id resolution. |
| `state/` | `active-state.ts`, `state-schema.ts`, `state-writer.ts`, `workflow-state.ts` | Active-state, state validation/writes, workflow ids, and base state types. |

Workflow types:

```typescript
type WorkflowSkill = "deep-interview" | "ralplan" | "team" | "ultragoal";
type RalplanStage = "planner" | "architect" | "critic" | "revision" | "adr" | "final";
```

## Public API

The package entry point re-exports the workflow commands, the extension entry point, and the full harness runtime modules:

```typescript
import {
  handleWorkflowCommand,
  runWorkflowCommand,
  runStateCommand,
} from "@tsuuanmi/pi-workflows";
```

The default export is the workflows extension that the AI agent loads. Subpath exports:

- `@tsuuanmi/pi-workflows/commands/workflow` — the `pi workflow` command, including `pi workflow state`.
- `@tsuuanmi/pi-workflows/commands/state-command` — compatibility alias for `commands/workflow`.
- `@tsuuanmi/pi-workflows/runtime/*` — individual harness runtime modules (sessions, leases, RPC, GC, mutation, storage, receipt rules, etc.).

See `src/index.ts` for the complete barrel.

## Development

```bash
# Build (after any src change, rebuild before vitest/tsgo in this monorepo)
npm run build

# Typecheck
tsgo --noEmit

# Lint/format
biome check --write --error-on-warnings .

# Targeted tests
npx vitest --run <file>
```

Workspace tests import packages from the gitignored `dist/`, so rebuild this package after any `src/` change before running `vitest` or `tsgo`.

## Further Reading

- [docs/source-tree.md](docs/source-tree.md) — documentation map matching the current `src/` tree.
- [docs/workflow.md](docs/workflow.md) — full `pi workflow` control-plane reference, agent profiles, and internals.
- [docs/agents/agents.md](docs/agents/agents.md) — bundled agent profiles.
- [docs/commands/workflow.md](docs/commands/workflow.md) — command entry points and supported verbs.
- [docs/extensions/workflows.md](docs/extensions/workflows.md) — workflow extension hooks and registered tools.
- [docs/skills/](docs/skills/) — per-skill design docs.
- [docs/harness/](docs/harness/) — harness runtime, shared modules, subagent, and tool docs.
- [CHANGELOG.md](CHANGELOG.md) — changes.
- [Skills](https://github.com/tsuuanmi/pi/tree/main/packages/pi/docs/core/skills/skills.md) — Pi skill format and installation paths.
- [Subagents](https://github.com/tsuuanmi/pi/tree/main/packages/pi/docs/core/subagents/subagents.md) — Pi-native SubagentManager and subagent tools.

## License

MIT
