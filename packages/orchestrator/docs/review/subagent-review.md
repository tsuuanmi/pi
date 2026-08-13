# Subagent Manager — Design Review and Brainstorm

Date: 2026-08-13
Scope: `packages/orchestrator/src/subagent/` (`manager.ts`, `store.ts`, `progress.ts`, `types.ts`, `manager-api.ts`)
Reviewer notes for a follow-up implementation wave.

---

## 1. What the current design does

`SubagentManager` spawns isolated, persistent, multi-turn subagent sessions on top of the generic
`@tsuuanmi/pi-agent` session. Each subagent gets:

- Its **own `AgentSession`** and **own `SessionManager`** (persistent by default, `SessionManager.inMemory`
  when `persistent: false`, or reopening a saved `session_file` on resume). It never shares the parent's session.
- An **isolated services bundle** (`createIsolatedServices`) with its own `ResourceLoader`/extension runtime,
  so subagent dispose/reload cannot stale-ify the parent's captured extension API.
- Durable state under `.pi/<session-id>/state/subagent/`:
  - `index.jsonl` — append-only audit log (one line per write);
  - `<subagent-id>/record.json` — atomically written lifecycle record;
  - `<subagent-id>/artifact.json` — durable terminal output artifact.
- Full lifecycle: `queued → running → completed | failed | cancelled | paused`, plus `spawn`, `await`,
  `waitFor`, `steer`, `pause`, `resume`, `cancel`, `inspect`, `list`, `getProgress`.

Lifecycle controls operate directly on the live in-process session (cooperative pause via
`AgentOptions.shouldPause`; cancel via `AbortController`; steer/followUp via `sendUserMessage`).
Progress is captured **event-driven** through `session.subscribe` and retained as deep-cloned snapshots
(`SubagentProgressTracker`), surfaced on timeout/failure for diagnostics.

Role behavior is carried as a **system-prompt merge**, not an enforced guard: `resolveRequest` merges
`profile.systemPrompt + profile.appendSystemPrompt + request.systemPrompt`, then appends a subagent
observability contract, and passes the result as `extraSystemPrompt` to the agent session.

---

## 2. Strengths (production-grade traits)

- **Correct isolation.** Real per-subagent `ResourceLoader`/extension runtime; the shared-services
  pitfalls are explicitly designed around.
- **Durable, atomic state.** Temp-file + rename writes, append-only audit index, explicit lifecycle
  statuses. Survives process restart for records.
- **First-class lifecycle control.** Pause/resume/cancel/steer/followUp are all present and cooperative,
  not `kill -9`-style. This is more complete than many commercial orchestration stacks.
- **Event-driven observability.** Progress snapshots are derived from the agent event stream, deep-cloned
  to insulate retained state from live mutation.
- **Clean concurrency primitives.** `waitFor` races against a `timeoutMs` timer (`timer.unref()`), returns a
  retained progress snapshot on timeout, and does not kill the subagent (parent can keep polling).

---

## 3. Gaps and risks

### 3.1 No watchdog / self-healing / max-run-time (highest priority — decided, see section 4.4)
Nothing monitors a stuck subagent. A hung model or tool deadlock leaves the subagent `running` forever
unless the caller actively polls `getProgress`/`waitFor` and acts. There is no built-in max-run-time guard,
no retry-on-failure policy, and no stale-run reaper. Reliability is delegated entirely to the caller.

This is a **confirmed requirement**: subagents must be able to declare a hard completion deadline and must
not be allowed to run forever. The design is specified in **section 4.4**.

### 3.2 No restart reconciliation
The live run set is in-memory (`live` Map). On process restart, a `running` record on disk has no backing
live run and no reconciliation path (reap as interrupted, or resume). A production daemon needs a
recovery/cleanup pass over `running`/`queued`/`paused` records at startup.

### 3.3 Role is a label + prompt, not an enforced guard
`resolveRequest` sets `role = request.role ?? profile.name ?? "subagent"`, but role adherence only works if
the profile/system prompt actually encodes the role and the model follows it. There is:
- no role-scoped tool permissions (an analyst role cannot be prevented from running destructive tools);
- no role whitelist / consistency validation between `role`, `agent`, and `tools`;
- no enforcement if `role` is passed without `agent`/`systemPrompt` (label with no behavioral effect).

### 3.4 Error/result conflation
`result_text`/`output` are derived from the last non-empty assistant message. A "successful" run that emits
error-like text is indistinguishable from failure unless a `stopReason` (`error`/`aborted`/`length`) trips
`isAgentError`. No structured result schema or explicit success/failure contract from the agent itself.

### 3.5 No concurrency caps / backpressure
`runRecord` awaits each run's promise inside the manager; parallelism is limited to event-loop interleaving.
No worker pool, no max-concurrent-subagents cap, no queue/backpressure for heavy fan-out.

### 3.6 Operational observability is thin
Progress snapshots are diagnostic, not operational. No structured metrics/logs (start/end, token counts,
durations to a pipeline), no tracing correlation, no retention/cleanup policy — `index.jsonl` and session
dirs accumulate indefinitely.

### 3.7 Minor
- `resume()` collapses errors into `resume_failed` with no root cause surfaced.
- `pause()` after a run already completed still reports `ok: true` even though the record is `completed`.
- Nested subagents are disabled by stripping `subagent_spawn` and `subagent_*` lifecycle tools (safe, but no recursive fan-out by default).

---

## 4. Brainstorm — idea A: share parent/main-session "big picture" context

**Goal:** give a spawned subagent part of the parent's context so it knows the broader task, not just its
narrow prompt.

### Options

**A1. Inject a distilled "context brief" as `systemPrompt` (lowest risk, recommended).**
Build a short, structured brief from the parent session (goal, current task, key decisions, files in play,
constraints) and pass it via the existing `systemPrompt`/observability merge path. The subagent keeps its
isolated session (no shared message history), but receives a bounded summary.

- Pros: no architecture change, keeps isolation guarantees, cheap, no stale-context hazard.
- Cons: a summary is lossy; must be refreshed for each spawn; the subagent can't ask follow-ups about
  parent history (but `steer`/`resume` cover that).

**A2. Seed the subagent session with selected parent messages (copy-on-spawn).**
Copy a curated slice of parent messages (e.g., the goal + most recent N turns) into the new subagent
session as context. Stronger fidelity than a summary.

- Cons: risks leaking/duplicating large context; the copied turns may reference parent tools/results that
  don't exist in the subagent; must be snapshotted to avoid the subagent seeing parent updates mid-run.
  Higher complexity for marginal benefit.

**A3. Shared/append-only parent context read (advanced).**
Let the subagent read a read-only projection of parent context (e.g., a parent "goal ledger" or context
file) rather than injecting it. Keeps the subagent's prompt clean and the shared state authoritative.

- Cons: more plumbing (a read channel), staleness and attribution concerns.

### Recommendation
Ship **A1 (context brief injected at spawn)** first. It is the smallest correct change that addresses the
"big picture" need while preserving isolation. Add a **structured `contextBrief` field** on
`SubagentRunRequest` (or a builder on the parent) rather than overloading freeform `systemPrompt`, so the
manager can distinguish role instructions from task context. Reserve A2/A3 for a later wave with explicit
requirements on fidelity vs. isolation.

**Risk to mitigate:** do not inject raw parent message history; the subagent should not inherit parent tool
state it cannot act on. Keep the brief factual and bounded.

---

## 4.4 Brainstorm — idea C: max run-time rule (decided)

**Goal:** a subagent must complete within a caller-specified wall-clock time and must **not** be allowed to
run forever. This is a *run-side* hard deadline, distinct from `subagent_await`'s `timeoutMs`, which only
stops the caller from waiting while the subagent keeps running.

### Design

- Add `maxDurationMs` (wall-clock milliseconds) to `SubagentRunRequest` and persist it as
  `max_duration_ms` on `SubagentRecord`.
- The manager arms a watchdog when the run starts. If the run has not reached a terminal status when the
  deadline passes, the watchdog **aborts the run** (reuse the existing `AbortController` path) and writes a
  terminal record.
- The terminal status is **`failed`** with a recognizable error text such as
  `subagent exceeded max run time (maxDurationMs ms)`. This keeps the status enum unchanged (no schema
  break) while making timeout distinguishable by message.
- The retained `SubagentProgress` snapshot (turns, current tool, recent output) must be preserved on the
  timeout path so the parent can diagnose *where* the subagent was stuck.
- `maxDurationMs` must also be honored on **`resume`**. Each resume re-arms the watchdog with an explicit
  override or the budget stored on the original record. **Implemented**: `resume` uses
  `options.maxDurationMs ?? record.max_duration_ms`.

### Race safety (implemented)

A late provider response (one that ignores abort and resolves after the deadline persisted `failed`) must
not overwrite the timeout record. `SubagentRunControl.finish()` claims the terminal outcome atomically:
- `finish()` returns `true` only if the run is not already aborted, clears the timer, and marks the run
  finished; it returns `false` (and is a no-op) after a timeout/cancel already claimed it.
- The success path calls `finish()` before persisting `completed`; the failure path calls it before
  persisting `failed`. A late success after a timeout therefore sees the aborted control and cannot write
  `completed`. The timeout record is preserved.

### Watchdog semantics

- **Manager-enforced deadline**: on expiry the watchdog aborts the session through the existing controller,
  disposes the live session, and returns a terminal failure without waiting indefinitely for the provider.
- **No grace window**: the in-process agent contract has no stronger force-kill primitive than abort +
  dispose. A second timer would add latency without increasing enforcement, so expiry is immediate.
- **No silent kill**: the terminal record and progress snapshot always survive the timeout.
- **Process-boundary limitation**: synchronous JavaScript that blocks the Node event loop cannot be
  interrupted by any in-process timer. Enforcing a deadline against that class of failure would require a
  worker/process isolation boundary; model requests and supported tools are expected to honor abort.

### Alternatives considered

- **Caller-side-only wait timeout (current `subagent_await`)**: rejected — it leaves the subagent running
  forever, which is exactly what we want to forbid.
- **New `timed_out` status**: considered, but adds a status enum change; deferred until a structured result
  schema (Wave 2) is introduced, when a `timeout` reason field is cleaner than a new status.
- **No watchdog, rely on caller polling**: rejected — reliability must not depend on the caller polling.

### Impact (as implemented)

- `run-control.ts` (new): `SubagentRunControl` owns deadline validation, timer lifecycle, external abort
  forwarding, `waitFor` promise handling, and abort classification (`cancelled` vs `timed_out`).
- `types.ts`: `SubagentRunRequest.maxDurationMs`; `SubagentRecord.max_duration_ms`.
- `manager-api.ts`: expose `maxDurationMs` in `resume` options.
- `manager.ts`: validate via `normalizeMaxDurationMs`, arm the watchdog in `runRecord`, abort + persist
  `failed` on expiry, preserve progress, honor `maxDurationMs` on resume, and claim the terminal outcome
  with `finish()` to close the late-response race.
- `tool-schemas.ts` / `tool-execution.ts`: expose `maxDurationMs` on `subagent_spawn` / `subagent_resume`
  and surface `max_duration_ms` in status output.
- `lifecycle-tools.ts`: updated tool descriptions.
- `receipts.ts`: include `max_duration_ms` in receipts.
- `tests`: `manager.test.ts` (deadline enforcement, invalid-budget validation, resume inheritance and
  override, late-response preservation), `receipts.test.ts`.
- `store.ts`: no change (reuses existing terminal-write path).
- Docs: `docs/subagent/index.md` (run-time rule), this review; `CHANGELOG.md` entry.

---

## 5. Brainstorm — idea B: stricter adherence to agent definitions (`packages/workflows/src/agents/`)

**Goal:** the workflows role agents (e.g., `worker.md`, `explorer.md`, `planner.md`, `architect.md`,
`critic.md`, `expert.md`, `reviewer.md`, `prover.md`) define a fixed role, thinking level, tool allowlist,
and system prompt. Spawning a subagent should follow that definition strictly for more reliable results.

### Current behavior
`manager.spawn({ agent: request.profile, ... })` already loads the profile via `loadAgentProfile` and
merges its `systemPrompt`, `tools`, `model`, `thinkingLevel`, `persistent`. So the profile **is** applied.
But it is applied **loosely**:
- `request.tools`/`excludeTools`/`model`/`thinkingLevel`/`systemPrompt` can override the profile on every
  spawn; workflow callers deliberately provide per-stage instructions while generic execution remains policy-free.
- Nothing validates that the chosen profile is a known role, or that requested overrides are compatible
  with the role's allowlist.
- `role` and `agent` (profile) are independent fields; a spawn can name a role but use a different or no
  profile.

### Options

**B1. Strict profile binding (recommended baseline).**
When `agent` is provided, treat the profile as the authoritative source for `tools`, `excludeTools`,
`model`, `thinkingLevel`, and the system prompt by default. Only explicit, caller-sourced overrides
that pass a compatibility check are honored:
- Validate that the requested `role` matches the profile (if both provided), or derive `role` from the
  profile name only.
- Validate tool overrides against the profile's allowlist (a caller may narrow, not widen, unless it
  explicitly opts in).
- Optionally add a `strict: boolean`/`lockProfile: boolean` flag to `SubagentRunRequest` so a coordinator
  can force exact-profile execution and forbid override-driven role drift.

**B2. Registered role manifest + role-scoped permissions.**
Add a registry of known role agents (the workflows set) and enforce:
- a role whitelist (spawn only accepts known roles);
- role-scoped tool permissions (each role's allowlist is a hard ceiling, not just a suggestion);
- a consistency check: `role` must be the profile the caller claims, else reject.
This directly fixes the "role is a label" gap (3.3) and makes tool scoping real.

**B3. Role enforcement at the tool layer (advanced).**
Beyond prompt-level role adherence, enforce it in tool registration: construct the subagent session's tool
set from the profile allowlist and block anything outside it. Because `createAgentSessionFromServices`
already accepts a `tools` allowlist, this is mostly wiring + validation rather than a new mechanism.

### Recommendation
Ship **B1 + B3 together** as the first strictness wave:
- `loadAgentProfile` already gives us `tools`/`excludeTools`/`model`/`thinkingLevel`/`systemPrompt`; make
  these the baseline and validate overrides against them.
- Enforce the allowlist at tool registration (B3) so a subagent literally cannot invoke tools outside its
  role, closing the "prompt-only" gap.
Then layer **B2 (role manifest / whitelist / scoped permissions)** on top for coordination policy.

**Note on workflow callers:** guarded workflows provide explicit per-stage `systemPrompt` and task data to
`subagent_spawn`. Strict binding must preserve the ability for a trusted workflow coordinator to set those
instructions deliberately while rejecting untrusted runtime model/tool overrides.

---

## 6. Proposed sequencing (effort vs. impact)

| Wave | Change | Effort | Impact |
| --- | --- | --- | --- |
| 1 | **Max run-time rule (section 4.4) — implemented** | M | High (self-healing) |
| 1 | Restart reconciliation of `running`/`queued`/`paused` records | M | High (durability) |
| 1 | Strict profile binding + tool-layer enforcement (B1+B3) | M | High (reliability) |
| 1 | `contextBrief` injection at spawn (A1) | S | Medium (big-picture) |
| 2 | Role manifest / whitelist / scoped permissions (B2) | M | High (policy) |
| 2 | Structured result schema (typed success/failure contract) | M | Medium |
| 2 | Concurrency caps + backpressure | M | Medium (scale) |
| 3 | Operational metrics/logs + retention policy | S-M | Medium (ops) |
| 3 | Fix `resume_failed` root cause + `pause` completed-flag semantics | S | Low |

---

## 7. Open questions before implementation

1. Should deployments configure a global default `maxDurationMs`, or keep the budget caller-specified?
2. On restart, should orphaned `running` records be marked `interrupted` (safe) or auto-resumed?
3. For A1, what is the parent-side source of the "big picture" brief (session goal, task context map,
   goal ledger)? Who owns building/refreshing it?
4. For B1, how strict should overrides be? Narrowing tools = allowed; widening tools = blocked unless an
   explicit `lockProfile: false`? Who is the trusted override caller (coordinator vs. raw user)?
5. Should strict role binding be enforced by generic execution or only by workflow-owned pre-spawn policy?
6. Should the role manifest live in `packages/orchestrator` (generic) or `packages/workflows`
   (domain roles)? Prefer workflows for the domain roles; orchestrator stays generic.

---

## 8. Files referenced

- `packages/orchestrator/src/subagent/manager.ts` — lifecycle + execution
- `packages/orchestrator/src/subagent/run-control.ts` — hard deadline, cancellation, and abort classification
- `packages/orchestrator/src/subagent/store.ts` — durable records + artifacts
- `packages/orchestrator/src/subagent/progress.ts` — event-driven progress snapshots
- `packages/orchestrator/src/subagent/types.ts` — request/record/result types
- `packages/orchestrator/src/subagent/manager-api.ts` — public surface
- `packages/orchestrator/src/subagent/tool-schemas.ts` — lifecycle tool parameter schemas
- `packages/orchestrator/src/subagent/tool-execution.ts` — lifecycle tool handlers
- `packages/orchestrator/src/subagent/receipts.ts` — structured receipts
- `packages/orchestrator/src/subagent/lifecycle-tools.ts` — tool registration + descriptions
- `packages/orchestrator/test/subagent/manager.test.ts` — lifecycle/deadline tests
- `packages/orchestrator/test/subagent/receipts.test.ts` — receipt tests
- `packages/orchestrator/docs/subagent/index.md` — current documented contracts
- `packages/orchestrator/CHANGELOG.md` — release notes
- `packages/workflows/src/agents/*.md` — role agent definitions (worker, explorer, planner, architect,
  critic, expert, reviewer, prover)
- `packages/workflows/src/skills/ralplan/agent-execution.ts` — workflow-owned admission and terminal validation
- `packages/workflows/src/skills/ralplan/agent-roles.ts` — stage-to-role mapping
