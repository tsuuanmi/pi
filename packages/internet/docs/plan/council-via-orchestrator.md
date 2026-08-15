# Internet — Council vs. Current (Orchestrator + Internet)

This document answers: **if we want the package to work like codexweb's Council (multi-agent), how
does the current design (orchestrator + internet) compare, and what is the best session model?** It
is **not** "Council vs. orchestrator" — the orchestrator is a dependency the package will use. The
real comparison is **Council (codexweb's Electron app) vs. the current stack (orchestrator +
internet package)**.

> Status: **analysis + direction.** This is a design analysis that also records the agreed direction:
> the orchestrator is the **coordination skeleton only** and stays **model-agnostic**; the package
> will add it as a dependency; and the future team model is **multi-provider × multi-account** with
> the Pi session as the lead session. It informs the "Council is future" decision in
> `review/architecture-review.md`.

---

## 1. The comparison is Council vs. current (orchestrator + internet)

Council is not an alternative to the orchestrator. The orchestrator is a **library the package will
depend on**. The real comparison is between two ways to build multi-agent:

| | Council (codexweb 3.x) | Current stack (orchestrator + internet) |
|---|---|---|
| Host | Electron app (launcher) | Pi package (provider + tools) |
| Coordination | Council's own task/decision engine | `@tsuuanmi/pi-orchestrator` (task DAGs, gates, consensus, checkpoints) |
| Agents | ChatGPT conversations driven through the browser | Pi agents (model + tools) linked to provider chat sessions |
| Model knowledge | ChatGPT-only | Model-agnostic (ChatGPT, Gemini, Claude) |
| Session model | Project Lead + managed child agents | Pi lead session + isolated agent/subagent sessions |
| Browser | Electron Chromium | System Chrome via Playwright |

So the question is not "orchestrator or Council" — it is **"build multi-agent on the current stack
(orchestrator + internet) or adopt Council's Electron app."** The current stack is the right choice
for a Pi provider package; Council's Electron app is a separate product.

### What Council is (codexweb 3.x)

From `codexweb/docs/council.md` and `src/council/` (~2,843 lines):

- A ChatGPT Project Lead spawns **managed child agents** (Alice/Bob/Carol) that run in **persistent
  ChatGPT conversations**.
- Managed state (id/name/role/mandate/permissions/conversation URL/checkpoint) is private; the
  dashboard sees only sanitized metadata.
- A **browser response protocol** (`<COUNCIL_ACTIONS>`) with actions like `SAY`, `WAKE`,
  `SPAWN_AGENT`, `CREATE_TASK`, `FINAL_DECISION`, `CHECKPOINT`, `SLEEP`.
- Atomic action application, a decision gate, durable wake delivery, and a resurrection packet.
- Council is **Electron-first** and depends on the launcher app, which the package deliberately does
  not ship.

---

## 2. What the orchestrator provides

`@tsuuanmi/pi-orchestrator` (`packages/orchestrator`) is a **task-DAG orchestrator** over Pi agents:

- `orchestrator.plan(team, goal, { coordinator })` → strict task plan (DAG).
- `orchestrator.run(team, tasks, ...)` → dependency-aware scheduling, agent assignment, retries,
  abort handling, trace/progress events, checkpoints, receipts.
- Scheduling strategies: `dependency-first`, `composite`, `capability-match`, `least-busy`,
  `round-robin`.
- Governance hooks: `approveTaskDispatch`, `verifyTask`, `approveConsequentialTask`,
  `createConsensusVerifier`, `classifyTaskRetry`, `handleTaskFailure`.
- Run budgets (`maxTaskStarts`, `maxRunMs`), checkpoints, and structured handoffs.
- A `SubagentManager` for isolated, persistent, resumable subagent sessions.

The orchestrator's agents are **Pi agents** (model + system prompt + tools), not browser-backed
ChatGPT conversations.

### The orchestrator is a model-agnostic skeleton

A key agreed boundary: the orchestrator **must not know about the model**. It coordinates **Pi
agents** (which happen to be backed by whatever model/provider the package registers) but it has no
concept of ChatGPT vs. Gemini vs. Claude and no `<COUNCIL_ACTIONS>` protocol. The package owns all
model/provider knowledge; the orchestrator only schedules, assigns, retries, gates, and checkpoints
generic Pi agents. This keeps the orchestrator reusable and the model-specific logic in the package.

### Each agent session maps 1:1 to a provider chat session

There is **no separate "browser-backed" agent concept**. A spawned agent or subagent simply has its
**own Pi session**, and that Pi session is linked to one or more provider chat session IDs:

```text
Pi session ID  <──linked──>  provider chat session IDs
                             (ChatGPT conversation ID, Gemini thread ID, Claude thread ID)
```

The package owns this mapping. When it registers a provider, each Pi agent/subagent session resolves
to a specific account, and that account's daemon owns the provider chat session ID for the lifetime
of the Pi session. The orchestrator sees a generic Pi agent; the package supplies the
session→chat-ID linkage underneath.

---

## 3. Where they overlap

Both are "multi-agent coordination." The orchestrator already provides the **coordination layer**
that Council needs:

- **Task DAGs** — Council's `CREATE_TASK` / `FINAL_DECISION` map to orchestrator tasks and
  dependencies.
- **Agent assignment** — Council's managed child agents map to orchestrator team agents.
- **Decision gate** — Council's decision gate maps to `approveTaskDispatch` /
  `approveConsequentialTask` / `createConsensusVerifier`.
- **Durable wake / resurrection** — Council's wake engine and resurrection packet map to
  orchestrator checkpoints and subagent resume.
- **Consensus** — Council's deliberation maps to `createConsensusVerifier({ judges, minApprovals })`.

So the orchestrator is a strong fit for the **coordination** half of Council.

---

## 4. Where they diverge (the hard part)

The current stack does **not** provide the thing that makes Council "Council":

- **Provider chat-session linkage.** The orchestrator sees a generic Pi agent; it has no concept of
  a session linked to a ChatGPT conversation ID (or a Gemini/Claude thread ID). The package supplies
  the session→chat-ID mapping per account. This is not a fundamental divergence — it is a linkage
  the package owns, not the orchestrator.
- **The browser response protocol.** `<COUNCIL_ACTIONS>` parsing, atomic action application, and
  the decision gate over browser turns are Council-specific and live in the daemon, not the
  orchestrator.
- **The launcher app.** Council is Electron-first; the package ships no launcher.

So the current stack can provide the **coordination skeleton** (via the orchestrator), but the
**provider chat-session linkage** (each agent session bound to one or more provider conversations) is
the package's job and must not leak into the orchestrator.

---

## 5. Recommendation

**Yes, the current stack (orchestrator + internet) can provide Council-like multi-agent — but only
as the coordination skeleton, and only after the provider chat-session linkage exists.**

### The orchestrator is a dependency of the package

The package will add `@tsuuanmi/pi-orchestrator` as a **dependency** (future). The package does not
re-implement coordination; it consumes the orchestrator's public API (`plan`, `run`, team, hooks,
checkpoints, subagent manager) to drive its own agents. The orchestrator stays a consumer-facing
library the package calls, not something the package forks or wraps with its own coordination logic.

### The future team model: multi-provider × multi-account

The package will support **multiple providers, each with multiple accounts**. A team is therefore a
heterogeneous roster, e.g. **3 ChatGPT + 1 Gemini + 1 Claude**:

```text
Team (orchestrator)
├── ChatGPT agent A   (account A, provider chatgpt-web)
├── ChatGPT agent B   (account B, provider chatgpt-web-2)
├── ChatGPT agent C   (account C, provider chatgpt-web-3)
├── Gemini agent      (account D, provider gemini)
└── Claude agent      (account E, provider claude)
```

Each team member is a **Pi agent** whose model/provider is resolved from the package's account
registry. The orchestrator sees only generic agents with capabilities/tools; it never sees the
underlying provider. This is exactly why the orchestrator must stay model-agnostic.

### Multi-agent uses distinct ports (one account = one daemon = one port)

The current model is **account = daemon instance = port**. A multi-agent team therefore runs **one
daemon per account on its own port**, and each agent's session is linked to that account's provider
chat session:

```text
ChatGPT agent A ──► daemon@:17841 ──► ChatGPT conversation A
ChatGPT agent B ──► daemon@:17842 ──► ChatGPT conversation B
ChatGPT agent C ──► daemon@:17843 ──► ChatGPT conversation C
Gemini agent    ──► gemini backend   ──► Gemini thread
Claude agent    ──► claude backend   ──► Claude thread
```

So "run **multiple** persistent browser-backed ChatGPT conversations (one per agent)" is exactly
the right first extension: it means **multiple daemon instances on distinct ports**, one per agent,
each bound to one Pi session → one provider chat ID.

### The Pi session is the lead session

The **Pi session is the "lead session"** — the coordinator that plans and dispatches the team. Each
team member runs in an **isolated agent session**, which can be either:

- an **isolated agent session** (a dedicated Pi agent session per member), or
- a **subagent session** spawned by the lead via the orchestrator's `SubagentManager`
  (`subagent_spawn` / `subagent_resume` / `subagent_steer` / `subagent_pause` / `subagent_cancel`).

The lead session owns the plan and the team; members are isolated, persistent, and resumable so a
long-running team can be checkpointed and resumed. This maps Council's "Project Lead + managed child
agents" onto the orchestrator's "coordinator + team agents" model, with the package supplying the
provider chat-session linkage underneath.

### Session model: one Pi session can link to multiple provider chats

A key design question is how many provider chat sessions one Pi session can hold. The agreed model:

- **One Pi session can link to one chat session per provider.** A single Pi session can hold **one
  ChatGPT conversation + one Claude thread + one Gemini thread** (3 chat sessions linked to 1 Pi
  session).
- **Additional ChatGPT sessions require a separate agent/subagent session.** If a team needs a second
  ChatGPT conversation, it must use a different agent or subagent session (each with its own Pi
  session → its own ChatGPT chat ID).

```text
One Pi session (lead)
├── ChatGPT chat A   (provider chatgpt-web)
├── Claude thread    (provider claude)
└── Gemini thread    (provider gemini)

Additional ChatGPT agents (separate sessions)
├── agent/subagent session 1 ──► ChatGPT chat B
├── agent/subagent session 2 ──► ChatGPT chat C
└── ...
```

This is the **best design** because it keeps the lead session's context coherent (one thread per
provider) while allowing unbounded team growth through isolated agent/subagent sessions. It also
matches the orchestrator's model: the lead is a coordinator, and each team member is an isolated,
resumable session.

### Brainstorm: is this the best session model?

Alternatives considered:

- **One Pi session = one chat session total (1:1).** Simpler, but forces a separate session for every
  provider, which fragments the lead's context and makes cross-provider comparison awkward. Rejected.
- **One Pi session = many chats per provider.** Would let one session hold multiple ChatGPT
  conversations, but breaks the clean session→chat-ID mapping and complicates which chat a turn goes
  to. Rejected — keep one chat per provider per session.
- **One Pi session = one chat per provider (agreed).** Best balance: coherent lead context, clean
  mapping, and unbounded team growth via agent/subagent sessions. **This is the recommended design.**

The agreed model is therefore: **one chat session per provider per Pi session**, with additional
same-provider sessions living in separate agent/subagent sessions.

The realistic path to "works like Council" in the package:

1. **First, multiple per-account sessions.** The package already runs one ChatGPT conversation per
   Pi session. The first extension is to run **multiple** persistent provider conversations, one per
   agent, by running **one daemon per account on its own port** (each account's daemon owns one
   provider chat session ID). This is the missing foundation.
2. **Then, the orchestrator as the coordinator.** Once each agent's session is linked to a provider
   chat ID (a plain Pi agent), the orchestrator's task DAGs, agent assignment, decision gates,
   consensus, checkpoints, and subagent resume provide the coordination layer. This is where the
   orchestrator genuinely helps.
3. **The `<COUNCIL_ACTIONS>` protocol** would be a thin adapter on top of the per-agent provider
   chat session, not a re-implementation of the orchestrator.

### What NOT to do
- Do **not** hand-roll a parallel task-DAG/consensus system in the package — the orchestrator already
  exists and is the right tool for coordination.
- Do **not** try to make the orchestrator drive browser-backed ChatGPT agents directly — that is the
  package's job (via the daemon), and the orchestrator should stay model-agnostic.
- Do **not** let the orchestrator learn about providers/models — it coordinates generic Pi agents
  only; all model/provider knowledge and the session→chat-ID linkage stay in the package.
- Do **not** model the provider chat session as a special agent type — it is just a Pi agent session
  linked to a provider chat ID via the package.
- Do **not** let one Pi session hold multiple chats for the same provider — keep one chat per
  provider per session; additional same-provider sessions live in separate agent/subagent sessions.

### Sequencing
- **Now:** keep Council as future. The current durable-conversation and canary work is the correct
  foundation (it proves one persistent ChatGPT conversation per Pi session works).
- **Next (if Council is pursued):** extend the daemon/package to run **multiple** persistent
  provider conversations by running **one daemon per account on its own port** (one per agent), then
  add `@tsuuanmi/pi-orchestrator` as a dependency and wire it as the model-agnostic coordinator over
  those plain Pi agents.
- The orchestrator is a **consumer** of the package's per-account agents, not a replacement for the
  session→chat-ID linkage.

---

## 6. Bottom line

- The comparison is **Council vs. current (orchestrator + internet)**, not Council vs. orchestrator.
  The orchestrator is a dependency the package will use.
- The current stack **can** provide Council-like multi-agent, but only as the **coordination
  skeleton** (task DAGs, agent assignment, decision gates, consensus, checkpoints, subagent resume).
- The orchestrator is **model-agnostic** — it coordinates generic Pi agents and never knows about
  ChatGPT vs. Gemini vs. Claude. All model/provider knowledge stays in the package.
- The package will add `@tsuuanmi/pi-orchestrator` as a **dependency** (future); it consumes the
  orchestrator, it does not re-implement coordination.
- The future team model is **multi-provider × multi-account** (e.g. 3 ChatGPT + 1 Gemini + 1
  Claude), with the **Pi session as the lead session** and each member in an **isolated agent
  session** or a **subagent session** spawned by the lead.
- **Session model:** one Pi session links to **one chat session per provider** (1 ChatGPT + 1 Claude
  + 1 Gemini = 3 chats on 1 Pi session). Additional same-provider sessions (e.g. a 2nd ChatGPT) live
  in separate agent/subagent sessions.
- The **provider chat-session linkage** (each agent/subagent Pi session bound to provider chat IDs)
  is the missing foundation and is the package's job, not the orchestrator's.
- **Multi-agent = one daemon per account on a distinct port**, each bound to one Pi session → one
  provider chat ID.
- Do not hand-roll coordination; do not force the orchestrator to own the provider chat linkage.
- Council stays future; the current stack is the right foundation to reach for when the per-account
  multi-session linkage exists.
